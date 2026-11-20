import { randomUUID } from "node:crypto";

export const PRODUCTION_STORE = "verified-product-inquiries";
export const PREVIEW_STORE = "verified-product-inquiries-preview";

function deployContext(context) {
  return context?.deploy?.context ?? process.env.CONTEXT ?? "";
}

export function selectBlobStore(context, { getStore, getDeployStore }) {
  const mode = deployContext(context);
  if (mode === "production") {
    return {
      mode,
      store: getStore({ name: PRODUCTION_STORE, consistency: "strong" }),
    };
  }
  if (["deploy-preview", "branch-deploy", "dev"].includes(mode)) {
    return {
      mode,
      store: getDeployStore({ name: PREVIEW_STORE, consistency: "strong" }),
    };
  }
  throw new Error("Product Inquiry storage is disabled for this deploy context");
}

async function readWithVersion(store, key) {
  const result = await store.getWithMetadata(key, { type: "json", consistency: "strong" });
  if (!result) return null;
  return { data: result.data, etag: result.etag };
}

async function conditionalSet(store, key, value, etag) {
  return store.setJSON(key, value, { onlyIfMatch: etag, metadata: { recordType: "notification-status" } });
}

export function createNetlifyBlobInquiryStore(blobStore) {
  if (!blobStore) throw new Error("Blob store is required");
  const inquiryKey = id => `inquiries/${id}.json`;
  const notificationKey = id => `notification-status/${id}.json`;

  return {
    async createInquiry(record) {
      const result = await blobStore.setJSON(inquiryKey(record.inquiryId), record, {
        onlyIfNew: true,
        metadata: {
          recordType: "verified-product-inquiry",
          submittedAt: record.submittedAt,
          dashboardProductId: record.product.dashboardProductId,
          sku: record.product.sku,
        },
      });
      if (result.modified) return { kind: "created", record };
      const existing = await blobStore.get(inquiryKey(record.inquiryId), { type: "json", consistency: "strong" });
      if (!existing) throw new Error("Conditional Blob write did not expose the existing inquiry");
      return existing.requestHash === record.requestHash ?
        { kind: "duplicate", record: existing } : { kind: "conflict", record: existing };
    },

    async ensureNotification(inquiryId, now) {
      const initial = {
        schemaVersion: 1,
        inquiryId,
        status: "pending",
        attempts: 0,
        createdAt: now.toISOString(),
        lastAttemptAt: null,
        sentAt: null,
        lastErrorCode: null,
        activeToken: null,
      };
      await blobStore.setJSON(notificationKey(inquiryId), initial, {
        onlyIfNew: true,
        metadata: { recordType: "notification-status" },
      });
      return initial;
    },

    async claimNotification(inquiryId, now, maxAttempts) {
      const key = notificationKey(inquiryId);
      for (let retry = 0; retry < 5; retry += 1) {
        const current = await readWithVersion(blobStore, key);
        if (!current) throw new Error("Missing notification status");
        const state = current.data;
        if (state.status === "sent") return { claimed: false, status: "sent" };
        const sendingSince = state.status === "sending" && state.lastAttemptAt ? Date.parse(state.lastAttemptAt) : NaN;
        if (state.status === "sending" && Number.isFinite(sendingSince) && now.getTime() - sendingSince < 300_000) {
          return { claimed: false, status: "pending" };
        }
        if (state.attempts >= maxAttempts) return { claimed: false, status: "failed" };
        const token = randomUUID();
        const next = {
          ...state,
          status: "sending",
          attempts: state.attempts + 1,
          lastAttemptAt: now.toISOString(),
          lastErrorCode: null,
          activeToken: token,
        };
        const result = await conditionalSet(blobStore, key, next, current.etag);
        if (result.modified) return { claimed: true, status: "sending", token, attempt: next.attempts };
      }
      return { claimed: false, status: "pending" };
    },

    async finishNotification(inquiryId, token, outcome, now, errorCode = null) {
      if (!new Set(["sent", "failed"]).has(outcome)) throw new Error("Invalid notification outcome");
      const key = notificationKey(inquiryId);
      for (let retry = 0; retry < 5; retry += 1) {
        const current = await readWithVersion(blobStore, key);
        if (!current) throw new Error("Missing notification status");
        if (current.data.activeToken !== token) return false;
        const next = {
          ...current.data,
          status: outcome,
          sentAt: outcome === "sent" ? now.toISOString() : current.data.sentAt,
          lastErrorCode: outcome === "failed" ? errorCode : null,
          activeToken: null,
        };
        const result = await conditionalSet(blobStore, key, next, current.etag);
        if (result.modified) return true;
      }
      throw new Error("Notification status update conflicted repeatedly");
    },
  };
}
