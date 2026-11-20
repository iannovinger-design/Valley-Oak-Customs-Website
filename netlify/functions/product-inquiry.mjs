import catalog from "../../product-inquiry-catalog.json" with { type: "json" };

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const emailPattern = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const deliveryOptions = new Map([
  ["Not sure yet", "Not sure yet"],
  ["Local pickup", "Local pickup"],
  ["Shipping — request a quote", "Shipping"],
]);

export const config = {
  path: "/api/product-inquiry",
  rateLimit: { windowLimit: 8, windowSize: 60, aggregateBy: ["ip", "domain"] },
};

function reply(status) {
  return new Response(null, { status, headers: { "Cache-Control": "no-store" } });
}

function singleLine(value, maxLength) {
  return typeof value === "string" && !/[\r\n\x00-\x1f\x7f]/.test(value) && value.length <= maxLength ? value.trim() : "";
}

async function readJson(request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Missing body");
  let total = 0;
  const chunks = [];
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > 12_288) throw new Error("Body too large");
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally {
    await reader.cancel().catch(() => {});
  }
}

export function createInquiryHandler({ products = catalog, send = sendOwnerEmail } = {}) {
  const bySlug = new Map();
  for (const product of products) {
    if (!slugPattern.test(product.slug) || bySlug.has(product.slug) ||
        !/^[\w.:-]{1,100}$/.test(product.sku) || !singleLine(product.title, 200) ||
        !/^(?:0|[1-9]\d*)\.\d{2}$/.test(product.price) ||
        (product.productId !== null && !/^[A-Za-z0-9][\w.:-]{0,127}$/.test(product.productId)) ||
        (product.quantity !== null && (!Number.isSafeInteger(product.quantity) || product.quantity < 0)))
      throw new Error("Invalid published Product Inquiry catalog");
    bySlug.set(product.slug, product);
  }
  return async request => {
    if (request.method !== "POST") return reply(405);
    if (request.headers.get("origin") !== new URL(request.url).origin) return reply(403);
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return reply(415);
    let input;
    try { input = await readJson(request); } catch { return reply(400); }
    if (!input || typeof input !== "object" || Array.isArray(input)) return reply(400);
    if (input["bot-field"]) return reply(400);
    const product = bySlug.get(singleLine(input.slug, 200));
    if (!product) return reply(400);
    if (input.displayedPrice !== product.price) return reply(409);

    const name = singleLine(input.customer_name, 100);
    const email = singleLine(input.email, 254);
    const delivery = deliveryOptions.get(input.fulfillment_interest);
    const zip = delivery === "Shipping" ? singleLine(input.shipping_zip, 10) : "";
    const message = input.questions === undefined ? "" : input.questions;
    if (!name || !emailPattern.test(email) || !delivery || typeof message !== "string" || message.length > 2000 ||
        /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(message) ||
        (delivery === "Shipping" && !/^\d{5}(?:-\d{4})?$/.test(zip))) return reply(400);

    const availability = product.quantity === null ? "" :
      product.quantity === 0 ? "Availability: Sold out at website update" : `Availability: ${product.quantity} available at website update`;
    const text = [
      `Product: ${product.title}`, `SKU: ${product.sku}`,
      product.productId && `Dashboard product ID: ${product.productId}`,
      `Advertised price: $${product.price}`, `Product page: https://valleyoakcustoms.com/products/${product.slug}`, availability,
    ].filter(Boolean).join("\n") + "\n\n" + [
      `Customer: ${name}`, `Email: ${email}`, `Delivery: ${delivery}`, zip && `ZIP code: ${zip}`,
    ].filter(Boolean).join("\n") + `\n\nMessage:\n${message.trim() || "Customer did not include an additional message."}`;

    try {
      await send({ subject: `New Product Inquiry — ${product.sku}`, text, replyTo: email });
      return reply(204);
    } catch {
      return reply(502);
    }
  };
}

async function sendOwnerEmail({ subject, text, replyTo }) {
  const { PRODUCT_INQUIRY_EMAIL_API_KEY: key, PRODUCT_INQUIRY_FROM: from, PRODUCT_INQUIRY_TO: to } = process.env;
  if (!key || !from || !to) throw new Error("Owner email transport is not configured");
  const result = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, text, reply_to: replyTo }),
    signal: AbortSignal.timeout(8000),
  });
  if (!result.ok) throw new Error("Owner email transport did not accept the message");
}

export default createInquiryHandler();
