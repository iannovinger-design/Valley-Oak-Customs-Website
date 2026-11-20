const menuButton = document.querySelector(".menu-toggle");
const nav = document.querySelector(".site-nav");
const quoteForms = document.querySelectorAll(".quote-form");

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

const productReferences = {
};

// The published catalog supplies all displayed product details.
const productInquiryForm = document.querySelector("#product-inquiry-form");
if (productInquiryForm instanceof HTMLFormElement) setupProductInquiry(productInquiryForm);

function setupProductInquiry(form) {
  const slug = new URLSearchParams(window.location.search).get("slug") || "";
  const productDisplay = document.querySelector("#inquiry-product-display");
  const priceDisplay = document.querySelector("#inquiry-price-display");
  const productLink = document.querySelector("#inquiry-product-link");
  const fulfillment = form.elements.fulfillment_interest;
  const zip = form.elements.shipping_zip;
  const zipField = document.querySelector("#inquiry-shipping-zip-field");
  const status = document.querySelector("#product-inquiry-status");
  const success = document.querySelector("#product-inquiry-success");
  const submit = form.querySelector("[type='submit']");
  const localPreview = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  let selectedProduct;
  let pending = false;

  function updateZip() {
    const shipping = fulfillment.value === "Shipping — request a quote";
    zipField.hidden = zip.disabled = !shipping;
    zip.required = shipping;
    if (!shipping) zip.value = "";
  }

  async function loadProduct() {
    try {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error();
      const response = await fetch("/product-inquiry-catalog.json", { cache: "no-store" });
      if (!response.ok) throw new Error();
      const entries = await response.json();
      selectedProduct = entries.find(row => row.slug === slug);
      if (!selectedProduct) throw new Error();
      productDisplay.textContent = selectedProduct.title;
      priceDisplay.textContent = "$" + selectedProduct.price;
      productLink.href = "/products/" + selectedProduct.slug;
      productLink.textContent = "Back to Product";
      submit.disabled = false;
    } catch {
      productDisplay.textContent = "Choose a product";
      status.textContent = "Return to Available Now and choose a product to ask about.";
    }
  }

  fulfillment.addEventListener("change", updateZip);
  updateZip();
  if (localPreview) document.querySelector("#local-form-note").hidden = false;
  void loadProduct();
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!selectedProduct || pending) return;
    if (localPreview) {
      status.textContent = "Local preview only. Your information was not sent.";
      return;
    }

    pending = true;
    submit.disabled = true;
    status.textContent = "Sending your question…";
    status.classList.remove("is-error");
    try {
      const fields = Object.fromEntries(new FormData(form));
      const response = await fetch(form.action, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...fields, slug: selectedProduct.slug, displayedPrice: selectedProduct.price }),
      });
      if (response.status === 409) {
        status.textContent = "The product price changed. Reload this page and review the new price.";
        status.classList.add("is-error");
        return;
      }
      if (!response.ok) throw new Error();
      form.hidden = true;
      success.hidden = false;
    } catch {
      pending = false;
      submit.disabled = false;
      status.textContent = "We couldn’t send your question. Please try again.";
      status.classList.add("is-error");
    }
  });
}