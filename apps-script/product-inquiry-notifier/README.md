# Product Inquiry Gmail notifier prototype

This folder is source only. Phase 6.9 does not create or deploy an Apps Script project and does not send email.

## Later installation requirements

1. Create a standalone Apps Script project owned by the Valley Oak Customs Gmail account.
2. Copy `Code.gs` and `appsscript.json` into that project.
3. Add Script Properties named `VOC_INQUIRY_HMAC_SECRET` and `VOC_INQUIRY_RECIPIENT`. The secret must contain at least 32 random characters. The recipient is the owner's existing Gmail address. Neither value belongs in Git.
4. Authorize the `script.send_mail` scope while signed in as the owner.
5. Deploy as a web app that executes as the owner and accepts requests from the Function. The endpoint is public at the network layer, so the HMAC, timestamp window and sent-ID ledger are mandatory.
6. Store the `/exec` URL in the Netlify environment variable `PRODUCT_INQUIRY_APPS_SCRIPT_URL` and the same HMAC secret in `PRODUCT_INQUIRY_HMAC_SECRET`.

The private test Function permits one notification POST and one claimed delivery cycle per inquiry UUID. A timeout, dropped response or unconfirmed status write does not cause another send. Apps Script uses `LockService` and `sent:<inquiry-id>` properties to suppress repeats.

Exactly-once email delivery cannot be guaranteed across two services. If Gmail accepts a message and Apps Script stops before writing `sent:<inquiry-id>`, a later manually authorized retry can send a duplicate. The email body includes the inquiry ID so duplicates can be recognized. Recording success before sending could permanently lose a notification.

The sent-ID ledger is intentionally persistent, but Apps Script Properties storage is finite. The current documented total is 500 KB per property store, and consumer MailApp currently allows 100 recipients per day. Check the live Google quota page before production setup and add an owner-approved ledger archive/rollover procedure before the store approaches its limit.

Apps Script errors return short codes and log only the code and inquiry ID. Customer details, the HMAC secret and stack traces are not logged by this code.
