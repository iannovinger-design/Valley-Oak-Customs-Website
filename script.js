const menuButton = document.querySelector(".menu-toggle");
const nav = document.querySelector(".site-nav");
const quoteForms = document.querySelectorAll(".quote-form");

if (menuButton && nav) {
  const primaryLinks = [["/", "Home"], ["/shop", "Shop"], ["/gallery", "Gallery"], ["/quote", "Request a Quote"],
    ["/about", "About"], ["/software", "Software"]];
  const pathname = window.location.pathname.replace(/\.html$/, "").replace(/\/$/, "") || "/";
  const galleries = ["/bigfoot", "/business-signs", "/chevy-truck-signs", "/customer-inspired-designs", "/flags", "/monograms"];
  const active = pathname === "/index" ? "/" : pathname.startsWith("/products/") || pathname === "/product-inquiry"
    ? "/shop" : galleries.includes(pathname) ? "/gallery" : pathname === "/monogram-request"
      ? "/quote" : pathname.startsWith("/software") ? "/software" : pathname;
  nav.replaceChildren(...primaryLinks.map(([href, label]) => {
    const link = document.createElement("a");
    link.href = href;
    link.textContent = label;
    if (href === active) link.setAttribute("aria-current", "page");
    return link;
  }));
  menuButton.setAttribute("data-menu-ready", "");
  function setMenu(open) {
    nav.classList.toggle("is-open", open);
    menuButton.setAttribute("aria-expanded", String(open));
    menuButton.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  }
  setMenu(false);
  menuButton.addEventListener("click", () => {
    setMenu(!nav.classList.contains("is-open"));
  });

  nav.addEventListener("click", (event) => {
    if (event.target instanceof HTMLAnchorElement) {
      setMenu(false);
    }
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && nav.classList.contains("is-open")) {
      setMenu(false);
      menuButton.focus();
    }
  });
  const legacyDestinations = { available: "/shop", gallery: "/gallery", about: "/about", quote: "/quote", home: "/" };
  for (const anchor of document.querySelectorAll("main a[href], .footer-links a[href]")) {
    const legacy = /^(?:\/(?:index\.html)?|(?:\.\/)?index\.html)#(available|gallery|about|quote|home)$/.exec(anchor.getAttribute("href"));
    if (legacy) anchor.href = legacyDestinations[legacy[1]];
  }
  const footerNav = document.querySelector(".footer-links");
  if (footerNav) {
    for (const [href, label] of primaryLinks.slice(1)) {
      const present = [...footerNav.querySelectorAll("a[href]")].some(link =>
        new URL(link.href).origin === window.location.origin &&
        new URL(link.href).pathname.replace(/\.html$/, "") === href);
      if (present) continue;
      const link = document.createElement("a");
      link.className = "footer-link";
      link.href = href;
      link.textContent = label;
      footerNav.append(link);
    }
  }
}

const shopGrid = document.querySelector("[data-shop-grid]");
if (shopGrid) {
  const cards = [...shopGrid.querySelectorAll("[data-shop-card]")];
  const more = document.querySelector("[data-shop-more]");
  const count = document.querySelector("[data-shop-count]");
  const pageSize = 12;
  let visible = 0;
  function showNext() {
    const firstNew = visible;
    visible = Math.min(visible + pageSize, cards.length);
    cards.forEach((card, index) => { card.hidden = index >= visible; });
    more.hidden = visible >= cards.length;
    count.textContent = cards.length > pageSize ? `Showing ${visible} of ${cards.length} products` : "";
    if (firstNew) cards[firstNew]?.querySelector("a")?.focus();
  }
  showNext();
  more.addEventListener("click", showNext);
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

// The published catalog supplies all displayed and stored product details.
const productInquiryForm = document.querySelector("#product-inquiry-form");
if (productInquiryForm instanceof HTMLFormElement) setupProductInquiry(productInquiryForm);

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

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
  const reference = document.querySelector("#product-inquiry-reference");
  const submit = form.querySelector("[type='submit']");
  const localPreview = ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
  const submissionId = crypto.randomUUID();
  let selectedProduct;
  let catalogHash = "";
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
      if (!Array.isArray(entries)) throw new Error();
      catalogHash = await sha256(JSON.stringify(entries));
      selectedProduct = entries.find(row => row.slug === slug && typeof row.productId === "string");
      if (!selectedProduct) throw new Error();
      productDisplay.textContent = selectedProduct.title;
      priceDisplay.textContent = "$" + selectedProduct.price;
      productLink.href = "/products/" + selectedProduct.slug;
      productLink.textContent = "Back to Product";
      submit.disabled = false;
    } catch {
      productDisplay.textContent = "Choose a product";
      status.textContent = "Return to Available Now and choose a listed product to ask about.";
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
      const customer = new FormData(form);
      const body = {
        submissionId,
        productId: selectedProduct.productId,
        catalogRevision: catalogHash,
        customerName: String(customer.get("customer_name") ?? ""),
        email: String(customer.get("email") ?? ""),
        fulfillment: String(customer.get("fulfillment_interest") ?? ""),
        shippingZip: String(customer.get("shipping_zip") ?? ""),
        message: String(customer.get("questions") ?? ""),
        website: String(customer.get("website") ?? ""),
      };
      const response = await fetch(form.action, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        redirect: "error",
      });
      const result = await response.json().catch(() => null);
      if (response.status === 409 && result?.code === "stale_catalog") {
        status.textContent = "This product changed. Reload this page and review the current details.";
        status.classList.add("is-error");
        return;
      }
      if (!response.ok || result?.accepted !== true || result.inquiryId !== submissionId) throw new Error();
      reference.textContent = "Inquiry reference: " + result.inquiryId;
      form.hidden = true;
      success.hidden = false;
    } catch {
      pending = false;
      submit.disabled = false;
      status.textContent = "We couldn’t confirm your inquiry. Please wait before trying again.";
      status.classList.add("is-error");
    }
  });
}

for (const gallery of document.querySelectorAll("[data-product-gallery]")) {
  const image = gallery.querySelector("figure img");
  const caption = gallery.querySelector("figcaption");
  const thumbnails = gallery.querySelector(".product-photo-thumbnails");
  const slides = [...thumbnails.querySelectorAll("[data-gallery-slide]")];
  thumbnails.hidden = false;
  gallery.addEventListener("click", event => {
    const selected = event.target.closest("[data-gallery-slide]");
    if (!selected || selected.getAttribute("aria-pressed") === "true") return;
    image.src = selected.dataset.photoSrc;
    image.alt = selected.dataset.photoAlt;
    caption.textContent = selected.dataset.photoCaption;
    caption.hidden = !selected.dataset.photoCaption;
    for (const slide of slides) slide.setAttribute("aria-pressed", String(slide === selected));
  });
}

// Enhance the same main image used by both single-photo and gallery listings.
const productPhoto = document.querySelector(".product-detail-page .physical-product-photo");
const selectedPhoto = productPhoto?.querySelector("img");
if (selectedPhoto && typeof HTMLDialogElement !== "undefined" &&
    typeof HTMLDialogElement.prototype.showModal === "function") {
  const opener = document.createElement("button");
  opener.type = "button";
  opener.className = "photo-enlarge";
  opener.setAttribute("aria-haspopup", "dialog");
  const label = document.createElement("span");
  label.textContent = "Enlarge photo";
  selectedPhoto.before(opener);
  opener.append(selectedPhoto, label);

  const dialog = document.createElement("dialog");
  dialog.className = "product-photo-dialog";
  dialog.setAttribute("aria-label", "Enlarged product photo");
  const close = document.createElement("button");
  close.type = "button";
  close.className = "photo-dialog-close";
  close.textContent = "Close photo";
  close.autofocus = true;
  const full = document.createElement("img");
  full.addEventListener("load", () => {
    full.style.setProperty("--photo-ratio", full.naturalWidth / full.naturalHeight);
  });
  const caption = document.createElement("p");
  caption.className = "photo-dialog-caption";
  dialog.append(close, full, caption);
  document.body.append(dialog);

  opener.addEventListener("click", () => {
    if (selectedPhoto.complete && selectedPhoto.naturalWidth)
      full.style.setProperty("--photo-ratio", selectedPhoto.naturalWidth / selectedPhoto.naturalHeight);
    full.src = selectedPhoto.src;
    full.alt = selectedPhoto.alt;
    caption.textContent = productPhoto.querySelector("figcaption")?.textContent.trim() ?? "";
    caption.hidden = !caption.textContent;
    dialog.showModal();
    document.documentElement.classList.add("photo-dialog-open");
  });
  close.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right ||
        event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
  dialog.addEventListener("close", () => {
    document.documentElement.classList.remove("photo-dialog-open");
    full.removeAttribute("src");
    opener.focus({ preventScroll: true });
  });
}
