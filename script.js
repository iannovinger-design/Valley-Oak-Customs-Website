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
