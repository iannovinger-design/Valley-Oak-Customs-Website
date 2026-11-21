import { createHmac } from "node:crypto";

function base64url(value) {
  return Buffer.from(value, "utf8").toString("base64url");
}

export function notificationPayload(record) {
  return {
    schemaVersion: 1,
    inquiryId: record.inquiryId,
    submittedAt: record.submittedAt,
    product: record.product,
    customer: record.customer,
    fulfillment: record.fulfillment,
    message: record.message,
  };
}

export function signNotification({ timestamp, payload, secret }) {
  const encodedPayload = base64url(JSON.stringify(payload));
  const signature = createHmac("sha256", secret).update(`${timestamp}.${encodedPayload}`, "utf8").digest("hex");
  return { version: 1, timestamp, payload: encodedPayload, signature };
}

export class NotificationDeliveryUnknownError extends Error {}

export function createAppsScriptNotifier({ endpoint, secret, fetchImpl = fetch, clock = () => new Date(), maxAttempts = 1 } = {}) {
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(endpoint ?? "")) {
    throw new Error("Apps Script notifier endpoint is not configured");
  }
  if (typeof secret !== "string" || secret.length < 32) throw new Error("Apps Script notifier secret is not configured");
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 3) throw new Error("Invalid notifier retry limit");

  return {
    async send(record) {
      const payload = notificationPayload(record);
      let lastError;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const timestamp = clock().toISOString();
        const envelope = signNotification({ timestamp, payload, secret });
        try {
          const response = await fetchImpl(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(envelope),
            redirect: "follow",
            signal: AbortSignal.timeout(8_000),
          });
          const result = response.ok ? await response.json().catch(() => null) : null;
          if (result?.ok === true && result.inquiryId === record.inquiryId) return result;
          lastError = new Error("Notifier rejected the request");
        } catch {
          lastError = new Error("Notifier request failed");
        }
      }
      throw new NotificationDeliveryUnknownError(lastError.message);
    },
  };
}
