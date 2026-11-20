var VOC_NOTIFICATION_MAX_AGE_MS = 5 * 60 * 1000;
var VOC_NOTIFICATION_FUTURE_SKEW_MS = 60 * 1000;
var VOC_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function jsonResponse(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

function errorResponse(code, inquiryId) {
  console.error("product_inquiry_notifier_error", code, inquiryId || "unknown");
  return jsonResponse({ ok: false, code: code });
}

function byteHex(bytes) {
  return bytes.map(function (value) {
    return ((value + 256) % 256).toString(16).padStart(2, "0");
  }).join("");
}

function constantTimeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string" || left.length !== right.length) return false;
  var difference = 0;
  for (var index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function decodePayload(value) {
  var bytes = Utilities.base64DecodeWebSafe(value);
  return JSON.parse(Utilities.newBlob(bytes).getDataAsString("UTF-8"));
}

function validatePayload(payload) {
  if (!payload || payload.schemaVersion !== 1 || !VOC_UUID_PATTERN.test(payload.inquiryId || "") ||
      typeof payload.submittedAt !== "string" || !payload.product || !payload.customer || !payload.fulfillment ||
      typeof payload.product.dashboardProductId !== "string" || typeof payload.product.sku !== "string" ||
      typeof payload.product.title !== "string" || typeof payload.product.advertisedPrice !== "string" ||
      typeof payload.product.canonicalUrl !== "string" || typeof payload.customer.name !== "string" ||
      typeof payload.customer.email !== "string" || typeof payload.fulfillment.choice !== "string" ||
      typeof payload.fulfillment.shippingZip !== "string" || typeof payload.message !== "string") {
    throw new Error("invalid_payload");
  }
  return payload;
}

function notificationBody(payload) {
  return [
    "A catalog-verified Product Inquiry was received.",
    "",
    "Inquiry ID: " + payload.inquiryId,
    "Received: " + payload.submittedAt,
    "",
    "Product: " + payload.product.title,
    "SKU: " + payload.product.sku,
    "Dashboard product ID: " + payload.product.dashboardProductId,
    "Advertised price: $" + payload.product.advertisedPrice,
    "Product page: " + payload.product.canonicalUrl,
    "",
    "Customer: " + payload.customer.name,
    "Email: " + payload.customer.email,
    "Fulfillment: " + payload.fulfillment.choice,
    payload.fulfillment.shippingZip ? "Shipping ZIP: " + payload.fulfillment.shippingZip : null,
    "",
    "Message:",
    payload.message,
  ].filter(function (line) { return line !== null; }).join("\n");
}

function doPost(event) {
  var inquiryId = "";
  var lock;
  try {
    var properties = PropertiesService.getScriptProperties();
    var secret = properties.getProperty("VOC_INQUIRY_HMAC_SECRET") || "";
    var recipient = properties.getProperty("VOC_INQUIRY_RECIPIENT") || "";
    if (secret.length < 32 || !recipient) return errorResponse("not_configured", inquiryId);

    var envelope = JSON.parse(event && event.postData && event.postData.contents || "");
    if (!envelope || envelope.version !== 1 || typeof envelope.timestamp !== "string" ||
        typeof envelope.payload !== "string" || typeof envelope.signature !== "string") {
      return errorResponse("invalid_envelope", inquiryId);
    }
    var timestamp = Date.parse(envelope.timestamp);
    var now = Date.now();
    if (!isFinite(timestamp) || now - timestamp > VOC_NOTIFICATION_MAX_AGE_MS ||
        timestamp - now > VOC_NOTIFICATION_FUTURE_SKEW_MS) {
      return errorResponse("expired_request", inquiryId);
    }
    var signed = envelope.timestamp + "." + envelope.payload;
    var expected = byteHex(Utilities.computeHmacSha256Signature(signed, secret, Utilities.Charset.UTF_8));
    if (!constantTimeEqual(expected, envelope.signature.toLowerCase())) {
      return errorResponse("invalid_signature", inquiryId);
    }

    var payload = validatePayload(decodePayload(envelope.payload));
    inquiryId = payload.inquiryId;
    lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) return errorResponse("busy", inquiryId);

    var sentKey = "sent:" + inquiryId;
    if (properties.getProperty(sentKey)) {
      return jsonResponse({ ok: true, inquiryId: inquiryId, duplicate: true });
    }

    MailApp.sendEmail({
      to: recipient,
      subject: "New Product Inquiry — " + payload.product.sku,
      body: notificationBody(payload),
      replyTo: payload.customer.email,
      name: "Valley Oak Customs Website",
    });
    properties.setProperty(sentKey, new Date().toISOString());
    return jsonResponse({ ok: true, inquiryId: inquiryId, duplicate: false });
  } catch (error) {
    return errorResponse(error && error.message === "invalid_payload" ? "invalid_payload" : "delivery_failed", inquiryId);
  } finally {
    if (lock && lock.hasLock()) lock.releaseLock();
  }
}
