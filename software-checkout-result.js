const tokenKey = "vodm-checkout-delivery-token";
const status = document.getElementById("purchaseStatus");
const panel = document.getElementById("credentialPanel");
const output = document.getElementById("licenseCredential");
const sessionId = new URL(location.href).searchParams.get("session_id");
const deliveryToken = sessionStorage.getItem(tokenKey);

history.replaceState(null, "", location.pathname);

async function retrieveCredential() {
  if (!sessionId || !deliveryToken) {
    status.textContent = "Your license could not be displayed in this tab. Check the email used at checkout or contact Valley Oak Customs.";
    return;
  }
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const response = await fetch("/licensing-api/checkout/credential", {method:"POST",credentials:"omit",headers:{"content-type":"application/json",Accept:"application/json"},body:JSON.stringify({checkoutSessionId:sessionId,deliveryToken})});
    const result = await response.json();
    if (response.ok && result.licenseCredential) {
      sessionStorage.removeItem(tokenKey);
      output.textContent = result.licenseCredential;
      panel.hidden = false;
      status.textContent = `Payment confirmed. Licensed to ${result.licensedTo}. Your license email is being delivered.`;
      return;
    }
    if (![409, 425, 503].includes(response.status)) break;
    await new Promise(resolve => setTimeout(resolve, 2500));
  }
  status.textContent = "Payment confirmation is still processing. Check the email used at checkout or contact Valley Oak Customs before attempting another purchase.";
}

document.getElementById("copyCredential").addEventListener("click", () => navigator.clipboard.writeText(output.textContent));
retrieveCredential().catch(() => {status.textContent = "License delivery is temporarily unavailable. Check your email or contact Valley Oak Customs; do not submit another payment.";});
