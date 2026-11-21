# Product Inquiry owner operations

This document distinguishes what the Phase 6.9 prototype supports from what still needs an owner-friendly control screen.

## Locate a verified inquiry

After a future production deployment:

1. Open the Valley Oak Customs project in Netlify.
2. Open **Data & storage > Blobs**.
3. Select the `verified-product-inquiries` store.
4. Open `inquiries`, then the JSON file named for the inquiry reference shown to the customer and included in Gmail.

The record contains the permanent Dashboard product ID, SKU, title, advertised price, slug, canonical URL, customer details, fulfillment choice, ZIP, message, catalog hash and submission timestamp.

The Dashboard product association is `product.dashboardProductId`. This is the durable link even if the SKU, price or slug later changes.

## Check Gmail notification status

In the same Blob store, open `notification-status/<inquiry-id>.json`.

- `sent` — Apps Script acknowledged the matching inquiry and the Function confirmed the conditional status write.
- `failed` — the canonical inquiry remains safe, but Gmail delivery needs attention.
- `unknown` — receipt or its status update could not be confirmed. Check Gmail by inquiry reference before considering any manual follow-up.
- `pending` or `sending` — delivery has not completed or a prior attempt stopped unexpectedly.
- `attempts` — number of claimed delivery cycles, capped at one in this release candidate.
- `lastErrorCode` — a short operational code, never a stack trace or secret.

## Recover when Gmail fails

The business-safe recovery requires no code editor:

1. Download/open `inquiries/<inquiry-id>.json` in the Netlify Blobs UI.
2. Use the stored customer email address to compose a normal Gmail reply.
3. Include the inquiry ID in the subject or notes so it remains traceable.

An owner-facing **Retry notification** button is not implemented. Recovery from a failed notification uses the saved inquiry and normal Gmail. Automated notification recovery is outside this release candidate.

## Retention and backups

Proposed starting policy: retain Product Inquiries for 12 months, export them before deletion, and delete only with explicit owner approval.

Netlify Blobs has no automatic TTL. The UI can browse and download individual records. A complete bulk JSONL/CSV export currently requires the Netlify API/CLI or a future owner-only export screen. That bulk export screen is unfinished functionality; the owner should not be expected to run developer commands for routine backups.

Until an owner export screen exists:

- Treat Netlify as the primary copy.
- Perform a developer-assisted quarterly export to an owner-controlled backup location.
- Record the export date, inquiry count and SHA-256 hash.
- Do not delete Blob records merely because Gmail was delivered.

## Everyday owner-readiness status

Ready in the prototype:

- Find a known inquiry by its reference.
- Identify the Dashboard product.
- Inspect notification success/failure.
- Recover the customer contact manually if Gmail fails.

Not yet owner-ready:

- Browse/search all inquiries in a friendly table.
- One-click bulk export.
- One-click retry of a failed notification.
- Owner-approved retention cleanup.

Those gaps do not affect validation or durable capture, but they must be completed before claiming the long-term workflow needs no technical assistance.
