# Product Inquiry native Forms proof of concept

The existing Product Inquiry page displays the catalog title and price and submits a URL-encoded request using the deployed form action. Netlify detects the form from `product-inquiry.html` and its `product-inquiry` name. The hidden fields declare the schema for capture. The browser sends the selected slug, the price it showed, and customer input. The Edge Function rejects browser attempts to set canonical fields and resolves title, SKU, permanent ID, price and product page using the deployed catalog. Netlify Forms remains the sole proposed capture and notification path.

The Edge Function requires a signed-in reviewer on a Deploy Preview of the exact site identified by `PRODUCT_INQUIRY_FORMS_TEST_SITE_ID`. Without all three checks, the intended intake rejects the request. It matches both intake spellings, `/product-inquiry-submit.html` and `/product-inquiry-submit`, and the two inquiry-page POST aliases. Quote Request and Monogram Quote do not go through this function. The prior provider adapter was removed from the isolated candidate. The server keeps no inquiry records of its own and sends no email.

## Hosted route mismatch

The approved test deploy at `f874d27` served the form with `action="/product-inquiry-submit"` after HTML post-processing. Netlify had injected `form-name` and retained the declared catalog fields. Both signed-in browser POSTs reached the extensionless URL and returned HTTP 200 without a validator handoff. The old Edge handler matched only the intake URL ending in `.html`, so no replacement request was built on those browser attempts. Forms stored the slug, customer fields and shipping ZIP, leaving the catalog fields and blank-message fallback empty. The browser correctly rejected the 200 response because it requires the validator's 204 handoff. The route correction addresses this mismatch. Hosted capture of the replacement body still requires proof.

## What local tests prove

Run `node --test`. The downstream mock reads the actual replacement Request passed to `context.next`. It receives all canonical fields and the optional-message fallback. Invalid and forged values do not reach that mock. The browser coalesces clicks while a request is pending and refuses to treat a plain static success response as a forwarded inquiry. Loopback browsers make no submission. Separate identical HTTP requests have no native Forms idempotency guarantee.

The forwarding response marker records an Edge handoff to a successful downstream response. It cannot prove that Netlify actually stored or sent anything. Netlify documents both transformed requests and native Forms POSTs to other paths. A path-scoped guard alone cannot demonstrate that all possible Forms entry paths are protected. Older deploys may also behave differently.

## Required hosted gates

1. Obtain separate authorization for a private team-login test project/repository, one preview branch push/build, and the nonsecret test site ID setting. Verify signed-out access is blocked first. Keep the isolated project's notifications disabled during capture and bypass tests. Verify the build detects one Product Inquiry form and the intended honeypot.
2. Use approved synthetic customer details. Verify the actual Forms record contains the replacement body, including the SKU, Dashboard ID, $10.00 price and canonical URL. Confirm the hosted success or error response is consistent with actual capture. Probe alternate static paths, routes, content types, aliases, historical deploy URLs and direct Forms entry points on the isolated target. A bypass or successful response without a corresponding normalized record is a no-go. Do not adopt a raw hidden-field fallback.
3. After those checks pass, separately authorize one synthetic send to regular Gmail. Configure exactly one native notification on the test project, using the existing recipient. Verify a single stored record and a single inbox message with the correct SKU and price. Do not test on production or duplicate the existing all-forms hook.
4. Report actual results and seek a separate production decision. The private-preview guard deliberately has no production enablement path. Preserve the one existing production Gmail hook and both quote forms in any later cutover.

[Native form detection and AJAX](https://docs.netlify.com/manage/forms/setup/) · [Edge request forwarding](https://docs.netlify.com/build/edge-functions/api/) · [Forms routing caveats](https://docs.netlify.com/resources/troubleshooting/troubleshooting-faq/)
