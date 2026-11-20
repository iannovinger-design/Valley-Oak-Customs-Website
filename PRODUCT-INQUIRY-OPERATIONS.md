# Product Inquiry review and delivery

The product page links to the existing Product Inquiry screen. The published catalog supplies the visible title and price, and the endpoint resolves the seller’s SKU, permanent product ID, current published price, canonical URL, and last published stock from that catalog. An unknown product or changed displayed price requires the customer to return to the listing. The customer provides a name, email, delivery preference, and ZIP when requesting shipping. A message is optional. The owner notification includes a short note when it was left blank.

Quote Request keeps its Netlify Forms route and email settings. Product Inquiry uses its own endpoint because the original draft used customer-controlled form fields as product metadata. The endpoint validates same-origin JSON, field bounds, the honeypot, and ZIP when shipping is selected. The function declares a per-IP rate limit. Its response contains no product IDs or customer details. It returns success after the mail provider accepts the notification.

## Local review

Run `node --test` for client and owner-notification behavior. The local-test browser form checks input and stops locally. The integration runner calls the exact generated site's endpoint code with a mock mail transport and synthetic customer details to produce an example message. Local tests never deliver mail.

## Hosted review gate

1. Review the exact generated proposal and authorize the preview-only branch/build and its access controls. Use the current approved package and recheck price and stock.
2. Configure `PRODUCT_INQUIRY_EMAIL_API_KEY`, `PRODUCT_INQUIRY_FROM`, and `PRODUCT_INQUIRY_TO` only for the authorized environment. Use a verified sender and a controlled nonproduction recipient for Deploy Preview. Keep the API key in function-scoped provider configuration.
3. Run a hosted end-to-end test with synthetic contact details. Confirm that the controlled inbox receives the SKU, advertised price, product page and customer reply-to, and that the site confirms acceptance and handles failures. Verify there is no legacy Product Inquiry notification path that can bypass validation. Review the hosting plan’s rate-limit settings.
4. Obtain separate owner approval before any live publication or production recipient configuration.
