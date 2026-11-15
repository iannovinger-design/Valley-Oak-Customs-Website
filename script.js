const menuButton = document.querySelector(".menu-toggle");
const nav = document.querySelector(".site-nav");
const quoteForms = document.querySelectorAll(".quote-form");
const productReferences = {
  "VOC-TS-015": "1955 Chevy Cameo (VOC-TS-015)",
};

const requestedProduct = new URLSearchParams(window.location.search).get("product");
const requestedProductReference = requestedProduct ? productReferences[requestedProduct] : undefined;

if (requestedProductReference) {
  const productReference = document.querySelector("#product-reference");
  const description = document.querySelector(".quote-form textarea[name='description']");
  if (productReference instanceof HTMLInputElement) productReference.value = requestedProductReference;
  if (description instanceof HTMLTextAreaElement && !description.value.trim()) {
    description.value = `I'm asking about ${requestedProductReference}.\n\n`;
  }
}

if (menuButton && nav) {
  menuButton.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("is-open");
    menuButton.setAttribute("aria-expanded", String(isOpen));
  });

  nav.addEventListener("click", (event) => {
    if (event.target instanceof HTMLAnchorElement) {
      nav.classList.remove("is-open");
      menuButton.setAttribute("aria-expanded", "false");
    }
  });
}

quoteForms.forEach((quoteForm) => {
  quoteForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const form = event.currentTarget;
    const status = form.querySelector(".form-status");
    const submitButton = form.querySelector("[type='submit']");
    const successMessage = form.dataset.successMessage || "Quote request sent. I will follow up after I review it.";

    if (status) {
      status.textContent = "Sending quote request...";
      status.classList.remove("is-error");
    }
    if (submitButton) submitButton.disabled = true;

    try {
      const response = await fetch("/", {
        method: "POST",
        body: new FormData(form),
      });

      if (!response.ok) throw new Error("Form submission failed");
      if (status) {
        status.textContent = successMessage;
        status.classList.remove("is-error");
      }
      form.reset();
      if (submitButton) submitButton.disabled = false;
    } catch (error) {
      if (status) {
        status.textContent = "That did not send. Please try again, or send the details by phone/email for now.";
        status.classList.add("is-error");
      }
      if (submitButton) submitButton.disabled = false;
    }
  });
});

// Dedicated product inquiry form. Query values are displayed with textContent/value only.
const productInquiryForm = document.querySelector("#product-inquiry-form");
if (productInquiryForm instanceof HTMLFormElement) {
  const inquiryParameters = new URLSearchParams(window.location.search);
  const inquiryProduct = (inquiryParameters.get("product") || "").trim();
  const inquirySku = (inquiryParameters.get("sku") || "").trim();
  const inquiryPriceValue = inquiryParameters.get("price") || "";
  const inquiryPrice = /^(?:0|[1-9]\d*)(?:\.\d{2})$/.test(inquiryPriceValue) ? inquiryPriceValue : "";
  const inquirySlugValue = inquiryParameters.get("slug") || "";
  const inquirySlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(inquirySlugValue) ? inquirySlugValue : "";
  const productDisplay = document.querySelector("#inquiry-product-display");
  const skuDisplay = document.querySelector("#inquiry-sku-display");
  const priceDisplay = document.querySelector("#inquiry-price-display");
  const productInput = document.querySelector("#inquiry-product-name");
  const skuInput = document.querySelector("#inquiry-product-sku");
  const priceInput = document.querySelector("#inquiry-product-price");
  const productLink = document.querySelector("#inquiry-product-link");
  const fulfillmentSelect = document.querySelector("#inquiry-fulfillment");
  const shippingZipField = document.querySelector("#inquiry-shipping-zip-field");
  const shippingZipInput = document.querySelector("#inquiry-shipping-zip");
  const localFormNote = document.querySelector("#local-form-note");
  const status = document.querySelector("#product-inquiry-status");
  const submitButton = productInquiryForm.querySelector("[type='submit']");
  const validProduct = inquiryProduct.length > 0 && inquiryProduct.length <= 200 && inquirySku.length > 0 && inquirySku.length <= 100 && inquiryPrice.length > 0;

  if (validProduct) {
    if (productDisplay) productDisplay.textContent = inquiryProduct;
    if (skuDisplay) skuDisplay.textContent = inquirySku;
    if (priceDisplay) priceDisplay.textContent = "$" + inquiryPrice;
    if (productInput instanceof HTMLInputElement) productInput.value = inquiryProduct;
    if (skuInput instanceof HTMLInputElement) skuInput.value = inquirySku;
    if (priceInput instanceof HTMLInputElement) priceInput.value = inquiryPrice;
  } else {
    if (productDisplay) productDisplay.textContent = "Product information is missing";
    if (status) status.textContent = "Return to Available Now and choose a product before using this form.";
    if (submitButton instanceof HTMLButtonElement) submitButton.disabled = true;
  }

  if (productLink instanceof HTMLAnchorElement && inquirySlug) {
    productLink.href = "/products/" + inquirySlug;
    productLink.textContent = "Back to Product";
  } else if (productLink instanceof HTMLAnchorElement) {
    productLink.href = "/#available";
    productLink.textContent = "Back to Available Now";
  }

  const updateShippingZip = () => {
    const shippingSelected = fulfillmentSelect instanceof HTMLSelectElement && fulfillmentSelect.value === "Shipping — request a quote";
    if (shippingZipField) shippingZipField.hidden = !shippingSelected;
    if (shippingZipInput instanceof HTMLInputElement) {
      shippingZipInput.disabled = !shippingSelected;
      if (!shippingSelected) shippingZipInput.value = "";
    }
  };
  if (fulfillmentSelect instanceof HTMLSelectElement) fulfillmentSelect.addEventListener("change", updateShippingZip);
  updateShippingZip();

  const isLocalPreview = window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost";
  if (isLocalPreview && localFormNote) localFormNote.hidden = false;
  productInquiryForm.addEventListener("submit", (event) => {
    if (!isLocalPreview) return;
    event.preventDefault();
    if (status) status.textContent = "Local preview only — the form was checked, but no customer information was sent.";
  });
}
