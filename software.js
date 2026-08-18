const softwareProducts = {
  "design-manager": {
    repository: "iannovinger-design/Valley-Oak-Design-Manager-Releases",
    fallbackVersion: "V1.1.1",
    installerPattern: /^Valley_Oak_Customs_Design_Manager_Setup_v[\d.]+\.exe$/i,
    zipPattern: /^Valley_Oak_Customs_Design_Manager_v[\d.]+_win-x64\.zip$/i,
  },
};

async function loadLatestStableRelease(section) {
  const product = softwareProducts[section.dataset.product];
  if (!product) return;

  const version = section.querySelector("[data-release-version]");
  const date = section.querySelector("[data-release-date]");
  const status = section.querySelector("[data-release-status]");
  const download = section.querySelector("[data-download-link]");
  const notes = section.querySelector("[data-release-notes]");
  const releasesUrl = `https://github.com/${product.repository}/releases/latest`;

  try {
    const response = await fetch(`https://api.github.com/repos/${product.repository}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!response.ok) throw new Error(`GitHub returned ${response.status}`);

    const release = await response.json();
    if (release.draft || release.prerelease) throw new Error("Latest release is not stable");

    const installer = release.assets.find((asset) => product.installerPattern.test(asset.name));
    const zip = release.assets.find((asset) => product.zipPattern.test(asset.name));
    const approvedAsset = zip || installer;
    if (!approvedAsset) throw new Error("No approved Windows package was found");

    version.textContent = release.tag_name || product.fallbackVersion;
    if (release.published_at) {
      const published = new Date(release.published_at);
      date.textContent = `Released ${published.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })} · Windows 10/11 · 64-bit`;
    }
    status.textContent = `${approvedAsset.name} · ${(approvedAsset.size / 1048576).toFixed(1)} MB`;
    download.href = approvedAsset.browser_download_url;
    notes.href = release.html_url;
  } catch (error) {
    version.textContent = product.fallbackVersion;
    status.textContent = "Live release details are temporarily unavailable. Open the official releases page to download safely.";
    download.href = releasesUrl;
    download.textContent = "Open Official Releases";
    notes.href = releasesUrl;
  }
}

document.querySelectorAll("[data-product]").forEach(loadLatestStableRelease);

const checkoutTokenKey = "vodm-checkout-delivery-token";
const buyButton = document.querySelector("[data-buy-design-manager]");
const checkoutStatus = document.querySelector("[data-checkout-status]");

if (buyButton) {
  buyButton.addEventListener("click", async () => {
    buyButton.disabled = true;
    checkoutStatus.textContent = "Opening secure Stripe Checkout…";
    try {
      const response = await fetch("/licensing-api/checkout/session", {
        method: "POST",
        credentials: "omit",
        headers: { Accept: "application/json" },
      });
      const result = await response.json();
      if (!response.ok || !/^https:\/\/checkout\.stripe\.com\//.test(result.checkoutUrl) || !result.deliveryToken) throw new Error();
      sessionStorage.setItem(checkoutTokenKey, result.deliveryToken);
      location.assign(result.checkoutUrl);
    } catch {
      buyButton.disabled = false;
      checkoutStatus.textContent = "Secure checkout is temporarily unavailable. No payment was taken.";
    }
  });
}
