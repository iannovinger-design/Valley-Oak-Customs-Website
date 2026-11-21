import catalog from "../../product-inquiry-catalog.json" with { type: "json" };
import { getDeployStore, getStore } from "@netlify/blobs";
import { createProductInquiryHandler } from "./lib/product-inquiry-core.mjs";
import { createAppsScriptNotifier } from "./lib/apps-script-notifier.mjs";
import { createNetlifyBlobInquiryStore, selectBlobStore } from "./lib/netlify-blob-inquiry-store.mjs";

export const config = {
  path: "/api/product-inquiry",
  rateLimit: {
    windowLimit: 8,
    windowSize: 60,
    aggregateBy: ["ip", "domain"],
  },
};

function env(name) {
  return globalThis.Netlify?.env.get(name) ?? process.env[name] ?? "";
}

function unavailableNotifier() {
  return { async send() { throw new Error("Product Inquiry notifier is not configured"); } };
}

function runtimeNotifier() {
  const endpoint = env("PRODUCT_INQUIRY_APPS_SCRIPT_URL");
  const secret = env("PRODUCT_INQUIRY_HMAC_SECRET");
  if (!endpoint || !secret) return unavailableNotifier();
  return createAppsScriptNotifier({ endpoint, secret, maxAttempts: 1 });
}

function safeFailure() {
  return Response.json({
    accepted: false,
    code: "service_unavailable",
    message: "Product inquiries are temporarily unavailable. Please wait and try again.",
  }, { status: 503, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

export default async function productInquiry(request, context) {
  try {
    const selected = selectBlobStore(context, { getStore, getDeployStore });
    const store = createNetlifyBlobInquiryStore(selected.store);
    return await createProductInquiryHandler({
      products: catalog, store, notifier: runtimeNotifier(), maxNotificationAttempts: 1,
    })(request);
  } catch {
    console.error("product_inquiry_runtime_unavailable");
    return safeFailure();
  }
}
