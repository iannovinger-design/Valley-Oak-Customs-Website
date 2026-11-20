import catalog from "../../product-inquiry-catalog.json" with { type: "json" };

const formName = "product-inquiry";
// Netlify's HTML post-processing can remove .html from the deployed form action.
const intakePaths = ["/product-inquiry-submit.html", "/product-inquiry-submit"];
const formContentType = "application/x-www-form-urlencoded";
const maxBodyBytes = 12_288;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const pricePattern = /^(?:0|[1-9]\d*)\.\d{2}$/;
const emailPattern = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const shipping = "Shipping — request a quote";
const deliveryOptions = new Set(["Not sure yet", "Local pickup", shipping]);
const clientFields = new Set([
  "form-name", "product_slug", "expected_price", "bot-field",
  "customer_name", "email", "fulfillment_interest", "shipping_zip", "questions",
]);

export const config = {
  path: [...intakePaths, "/product-inquiry", "/product-inquiry.html"],
  method: "POST",
  onError: "fail",
  rateLimit: { windowLimit: 8, windowSize: 60, aggregateBy: ["ip", "domain"] },
};

function reply(status, headers) {
  return new Response(null, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

function singleLine(value, maxLength) {
  return typeof value === "string" && !/[\x00-\x1f\x7f]/.test(value) && value.length <= maxLength ? value.trim() : "";
}

async function readForm(request) {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let encoded = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBodyBytes) return null;
      encoded += decoder.decode(value, { stream: true });
    }
    encoded += decoder.decode();
  } catch {
    return null;
  } finally {
    await reader.cancel().catch(() => {});
  }
  const result = new Map();
  for (const [key, value] of new URLSearchParams(encoded)) {
    if (!clientFields.has(key) || result.has(key)) return null;
    result.set(key, value);
  }
  return result;
}

function privatePreviewEnabled(context) {
  const approvedSite = globalThis.Netlify?.env.get("PRODUCT_INQUIRY_FORMS_TEST_SITE_ID");
  return Boolean(approvedSite && context.site?.id === approvedSite &&
    context.deploy?.context === "deploy-preview" && context.user?.id);
}

export function createInquiryEdge({ products = catalog, enabled = privatePreviewEnabled } = {}) {
  const bySlug = new Map();
  for (const product of products) {
    if (!slugPattern.test(product.slug) || bySlug.has(product.slug) ||
        !/^[\w.:-]{1,100}$/.test(product.sku) || !singleLine(product.title, 200) ||
        !pricePattern.test(product.price) || Number(product.price) <= 0 ||
        (product.productId != null && !/^[A-Za-z0-9][\w.:-]{0,127}$/.test(product.productId))) {
      throw new Error("Invalid published Product Inquiry catalog");
    }
    bySlug.set(product.slug, product);
  }

  return async (request, context) => {
    const url = new URL(request.url);
    if (request.method !== "POST" || !config.path.includes(url.pathname)) return;
    if (!intakePaths.includes(url.pathname) || url.search) return reply(404);
    if (!enabled(context)) return reply(403);
    if (request.headers.get("origin") !== url.origin) return reply(403);
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== formContentType ||
        request.headers.has("content-encoding")) return reply(415);

    const input = await readForm(request);
    if (!input || input.get("form-name") !== formName || input.get("bot-field") !== "") return reply(400);
    const product = bySlug.get(singleLine(input.get("product_slug"), 200));
    if (!product) return reply(400);
    if (input.get("expected_price") !== product.price) return reply(409);

    const name = singleLine(input.get("customer_name"), 100);
    const email = singleLine(input.get("email"), 254);
    const delivery = input.get("fulfillment_interest");
    const zip = delivery === shipping ? singleLine(input.get("shipping_zip"), 10) : "";
    const message = input.get("questions") ?? "";
    if (!name || !emailPattern.test(email) || !deliveryOptions.has(delivery) || message.length > 2000 ||
        /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(message) ||
        (delivery === shipping && !/^\d{5}(?:-\d{4})?$/.test(zip))) return reply(400);

    const body = new URLSearchParams({
      "form-name": formName,
      "bot-field": "",
      product_slug: product.slug,
      product_name: product.title,
      sku: product.sku,
      displayed_price: product.price,
      product_page: `https://valleyoakcustoms.com/products/${product.slug}`,
      customer_name: name,
      email,
      fulfillment_interest: delivery,
      questions: message.trim() || "Customer did not include an additional message.",
    });
    if (product.productId) body.set("product_id", product.productId);
    if (zip) body.set("shipping_zip", zip);

    const headers = new Headers(request.headers);
    headers.delete("content-length");
    headers.set("content-type", formContentType);
    try {
      const downstream = await context.next(new Request(request, { headers, body }));
      if (!downstream.ok) return reply(502);
      // This confirms middleware forwarding only. Hosted Forms capture and email
      // are separate acceptance checks and cannot be inferred from this header.
      return reply(204, { "X-VOC-Inquiry-Forwarded": "1" });
    } catch {
      return reply(502);
    }
  };
}

export default createInquiryEdge();
