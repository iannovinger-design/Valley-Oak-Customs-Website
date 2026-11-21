import { createHash } from "node:crypto";
import { NotificationDeliveryUnknownError } from "./apps-script-notifier.mjs";

const MAX_BODY_BYTES = 12_288;
const MESSAGE_LIMIT = 2_000;
const SHIPPING = "Shipping — request a quote";
const DELIVERY_OPTIONS = new Set(["Not sure yet", "Local pickup", SHIPPING]);
const INPUT_KEYS = new Set([
  "submissionId", "productId", "catalogRevision", "customerName", "email",
  "fulfillment", "shippingZip", "message", "website",
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRODUCT_ID = /^[A-Za-z0-9][\w.:-]{0,127}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SKU = /^[\w.:-]{1,100}$/;
const PRICE = /^(?:0|[1-9]\d*)\.\d{2}$/;
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const ZIP = /^\d{5}(?:-\d{4})?$/;

function jsonReply(status, body) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function reject(status, code, message) {
  return jsonReply(status, { accepted: false, code, message });
}

function singleLine(value, maxLength) {
  return typeof value === "string" && value.length <= maxLength &&
    !/[\r\n\x00-\x1f\x7f]/.test(value) ? value.trim() : "";
}

function canonicalProductUrl(slug) {
  return `https://valleyoakcustoms.com/products/${slug}`;
}

export function catalogRevision(products) {
  return createHash("sha256").update(JSON.stringify(products), "utf8").digest("hex");
}

export function prepareCatalog(products) {
  if (!Array.isArray(products)) throw new Error("Invalid published Product Inquiry catalog");
  const byId = new Map();
  const slugs = new Set();
  const skus = new Set();
  for (const product of products) {
    if (!product || typeof product !== "object" || Array.isArray(product) ||
        !PRODUCT_ID.test(product.productId ?? "") || byId.has(product.productId) ||
        !SLUG.test(product.slug ?? "") || slugs.has(product.slug) ||
        !SKU.test(product.sku ?? "") || skus.has(product.sku.toLowerCase()) ||
        !singleLine(product.title, 200) || !PRICE.test(product.price ?? "") ||
        Number(product.price) <= 0 ||
        (product.quantity != null && (!Number.isSafeInteger(product.quantity) || product.quantity < 0))) {
      throw new Error("Invalid published Product Inquiry catalog");
    }
    byId.set(product.productId, product);
    slugs.add(product.slug);
    skus.add(product.sku.toLowerCase());
  }
  return { products, byId, revision: catalogRevision(products) };
}

async function readJson(request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("missing_body");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) throw new Error("body_too_large");
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text);
  } finally {
    await reader.cancel().catch(() => {});
  }
}

function normalizeInput(input, catalog) {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).some(key => !INPUT_KEYS.has(key)) ||
      Object.keys(input).length !== INPUT_KEYS.size || input.website !== "") {
    return { error: "invalid_request" };
  }
  const submissionId = singleLine(input.submissionId, 36);
  const productId = singleLine(input.productId, 128);
  const revision = singleLine(input.catalogRevision, 64);
  if (!UUID.test(submissionId) || !PRODUCT_ID.test(productId)) return { error: "invalid_request" };
  if (revision !== catalog.revision) return { error: "stale_catalog" };
  const product = catalog.byId.get(productId);
  if (!product) return { error: "unknown_product" };
  if (product.quantity === 0) return { error: "product_unavailable" };

  const customerName = singleLine(input.customerName, 100);
  const email = singleLine(input.email, 254);
  const fulfillment = input.fulfillment;
  const shippingZip = fulfillment === SHIPPING ? singleLine(input.shippingZip, 10) : "";
  const message = input.message;
  if (!customerName || !EMAIL.test(email) || !DELIVERY_OPTIONS.has(fulfillment) ||
      typeof message !== "string" || message.length > MESSAGE_LIMIT ||
      /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(message) ||
      (fulfillment === SHIPPING && !ZIP.test(shippingZip)) ||
      (fulfillment !== SHIPPING && input.shippingZip !== "")) {
    return { error: "invalid_customer_details" };
  }
  return {
    submissionId,
    product,
    customerName,
    email,
    fulfillment,
    shippingZip,
    message: message.trim() || "Customer did not include an additional message.",
  };
}

function buildRecord(normalized, catalog, now) {
  const canonical = {
    schemaVersion: 1,
    inquiryId: normalized.submissionId,
    submittedAt: now.toISOString(),
    catalogRevision: catalog.revision,
    product: {
      dashboardProductId: normalized.product.productId,
      sku: normalized.product.sku,
      title: normalized.product.title,
      advertisedPrice: normalized.product.price,
      slug: normalized.product.slug,
      canonicalUrl: canonicalProductUrl(normalized.product.slug),
      quantityAtSubmission: normalized.product.quantity ?? null,
    },
    customer: {
      name: normalized.customerName,
      email: normalized.email,
    },
    fulfillment: {
      choice: normalized.fulfillment,
      shippingZip: normalized.shippingZip,
    },
    message: normalized.message,
  };
  const requestHash = createHash("sha256").update(JSON.stringify({
    inquiryId: canonical.inquiryId,
    catalogRevision: canonical.catalogRevision,
    productId: canonical.product.dashboardProductId,
    customer: canonical.customer,
    fulfillment: canonical.fulfillment,
    message: canonical.message,
  }), "utf8").digest("hex");
  return Object.freeze({ ...canonical, requestHash });
}

const errorMessage = {
  invalid_request: "Please review the form and try again.",
  stale_catalog: "This product changed. Reload the page and review the current details.",
  unknown_product: "This product is no longer available for inquiry.",
  product_unavailable: "This product is not currently available for inquiry.",
  invalid_customer_details: "Please review your contact and delivery information.",
};

function errorStatus(code) {
  return ["stale_catalog", "product_unavailable"].includes(code) ? 409 : 400;
}

export function createProductInquiryHandler({
  products, store, notifier, maxNotificationAttempts = 3, clock = () => new Date(), logger = console,
} = {}) {
  const catalog = prepareCatalog(products);
  if (!store || typeof store.createInquiry !== "function") throw new Error("Inquiry store is required");
  if (!notifier || typeof notifier.send !== "function") throw new Error("Inquiry notifier is required");

  return async function productInquiry(request) {
    if (request.method !== "POST") {
      return new Response(null, { status: 405, headers: { Allow: "POST", "Cache-Control": "no-store" } });
    }
    const url = new URL(request.url);
    if (request.headers.get("origin") !== url.origin) return reject(403, "forbidden", "The request could not be accepted.");
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json" ||
        request.headers.has("content-encoding")) {
      return reject(415, "unsupported_request", "The request format is not supported.");
    }

    let input;
    try {
      input = await readJson(request);
    } catch (error) {
      const tooLarge = error instanceof Error && error.message === "body_too_large";
      return reject(tooLarge ? 413 : 400, tooLarge ? "request_too_large" : "invalid_request",
        tooLarge ? "The request is too large." : errorMessage.invalid_request);
    }
    const normalized = normalizeInput(input, catalog);
    if (normalized.error) return reject(errorStatus(normalized.error), normalized.error, errorMessage[normalized.error]);

    const now = clock();
    const record = buildRecord(normalized, catalog, now);
    let stored;
    try {
      stored = await store.createInquiry(record);
    } catch {
      logger.error?.("product_inquiry_store_failed", { inquiryId: record.inquiryId });
      return reject(503, "storage_unavailable", "Your inquiry was not stored. Please wait and try again.");
    }
    if (stored.kind === "conflict") {
      return reject(409, "submission_conflict", "Please reload the form before trying again.");
    }

    let notification = "pending";
    try {
      await store.ensureNotification(record.inquiryId, now);
      const claim = await store.claimNotification(record.inquiryId, now, maxNotificationAttempts);
      if (claim.claimed) {
        let outcome = "sent";
        let errorCode = null;
        try {
          await notifier.send(stored.record ?? record);
        } catch (error) {
          outcome = error instanceof NotificationDeliveryUnknownError ? "unknown" : "failed";
          errorCode = outcome === "unknown" ? "delivery_unconfirmed" : "delivery_failed";
          logger.error?.("product_inquiry_notification_failed", { inquiryId: record.inquiryId, errorCode });
        }
        const updated = await store.finishNotification(record.inquiryId, claim.token, outcome, clock(), errorCode);
        notification = updated ? outcome : "unknown";
        if (!updated) logger.error?.("product_inquiry_notification_claim_lost", { inquiryId: record.inquiryId });
      } else {
        notification = claim.status;
      }
    } catch {
      logger.error?.("product_inquiry_notification_state_failed", { inquiryId: record.inquiryId });
      notification = "unknown";
    }

    const duplicate = stored.kind === "duplicate";
    const status = notification === "sent" ? (duplicate ? 200 : 201) : 202;
    return jsonReply(status, {
      accepted: true,
      inquiryId: record.inquiryId,
      duplicate,
      notification,
      message: "Your inquiry was received.",
    });
  };
}

export const productInquiryLimits = Object.freeze({ maxBodyBytes: MAX_BODY_BYTES, messageLength: MESSAGE_LIMIT });
