# Dedicated Product Inquiry prototype

Phase 6.9 replaces Native Netlify Forms as the Product Inquiry trust boundary. Quote Request and Monogram Quote remain native forms and are outside this endpoint.

## Data ownership

The Dashboard publishing bridge owns `product-inquiry-catalog.json`. Its existing array contract supplies `productId`, `sku`, `title`, `price`, `slug`, and `quantity`. The browser and Function independently hash `JSON.stringify()` of the parsed array. A request with an older hash receives `409 stale_catalog`.

The browser sends only a UUID, permanent product ID, catalog hash, customer contact and fulfillment details, optional message, and honeypot. The Function rejects extra fields, so a browser-supplied SKU or price is invalid rather than authoritative.

The Function owns two Blob key families:

- `inquiries/<uuid>.json` — immutable canonical record written with `onlyIfNew`.
- `notification-status/<uuid>.json` — mutable delivery state updated with ETag conditional writes.

Production uses the site-wide `verified-product-inquiries` store. Deploy Previews, branch deploys and Netlify Dev use the deploy-specific `verified-product-inquiries-preview` store. Unknown contexts fail closed. A Preview cannot select the production store through request data.

## Acceptance sequence

1. Validate method, same origin, JSON content type, no content encoding and a 12 KiB body limit.
2. Validate the exact input field set, UUID, catalog hash, product ID, honeypot, name, email, fulfillment, ZIP and 2,000-character message limit.
3. Resolve canonical product data from the bundled catalog and reject unavailable products.
4. Atomically create the immutable inquiry. An exact UUID replay returns the existing record; reuse with different content returns `409 submission_conflict`.
5. Create or recover the notification-status record and conditionally claim one delivery attempt.
6. Send a signed Apps Script request, with at most two network attempts in that cycle and at most three claimed cycles in Blob state.
7. Record `sent` or `failed`. Notification failure returns an accepted `202`; it never deletes the inquiry.

Customer success is shown only when the response contains `accepted: true` and the exact UUID generated for that form. The success panel displays the inquiry reference.

## Failure model

- If canonical Blob storage fails, the response is `503` and the UI does not show success.
- If the inquiry is stored but notification state or Gmail delivery fails, the response is `202` with the durable inquiry ID. The customer sees success because the business record exists.
- Canonical records and notification status use separate keys, so notification updates cannot rewrite product or customer details.
- Apps Script uses HMAC, a five-minute timestamp window, `LockService`, and a sent-ID property.
- Exactly-once email cannot be guaranteed. Gmail may accept a message immediately before Apps Script fails to record the sent ID. A retry can then send a duplicate. Every message includes the inquiry ID so the duplicate is recognizable.
- Deploy-specific Preview Blobs follow Netlify's deploy lifecycle and are test evidence, not a durable backup. Only the production site-wide store is the long-lived business record design.
- The Apps Script sent-ID ledger and MailApp are quota-bounded. The current consumer-account limits include 500 KB total Script Properties storage and 100 email recipients per day. These limits can change and must be checked before production approval; the ledger needs an archive/rollover plan before it approaches capacity.

No public GET, list, export, retry or administrative endpoint is implemented.

## Environment needed for a later private deployment

- `PRODUCT_INQUIRY_APPS_SCRIPT_URL` — deployed Apps Script `/exec` URL.
- `PRODUCT_INQUIRY_HMAC_SECRET` — at least 32 random characters, also stored in Apps Script Properties.

With those variables absent, verified inquiries remain storable but notification attempts are recorded as failed. Phase 6.9 does not create these values or deploy Apps Script.

## Cost expectation

There is no additional subscription. Function invocations and Blob operations consume the existing Pro plan's credits, so the expected additional bill is $0 only while the account remains within its purchased credit allowance. At Valley Oak Customs inquiry volume, expected incremental use is small but must be measured during hosted validation. Apps Script uses the existing consumer Gmail quota; it adds no paid email provider.

## Private hosted validation proposal

Use the existing private validation project only after separate authorization:

1. Deploy this branch to a private Deploy Preview with a deploy-specific Blob store.
2. Keep production Form notifications unchanged and do not configure Gmail.
3. Submit synthetic valid, invalid, stale, forged, duplicate and concurrent requests.
4. Inspect preview Blob keys and confirm the production site-wide store remains untouched.
5. Configure a synthetic Apps Script test double first and validate signatures/status changes without email.
6. Obtain a separate owner approval before creating an Apps Script deployment, adding secrets or sending one Gmail message.

Production promotion, Native Forms retirement and notification-setting changes remain separate decisions.
