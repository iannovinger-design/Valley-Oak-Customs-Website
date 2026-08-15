# Valley Oak Customs Website

Static Netlify-ready starter site for `valleyoakcustoms.com`.

## Files

- `index.html` is the public website.
- `thanks.html` is the quote form success page.
- `inventory.html` is the reserved private inventory page.
- `assets/shop-hero.jpg` is the temporary website artwork. `assets/shop-hero.png` is kept as the higher-quality source.
- `netlify.toml` tells Netlify to publish this folder as-is.

## Netlify Setup

1. Create a new Netlify site from this folder or from a Git repo containing these files.
2. Set the publish directory to the site folder. If the repo root is this folder, use `.`.
3. After deploy, Netlify should detect the `quote-request` form automatically.
4. In Netlify, add the custom domain `valleyoakcustoms.com`.
5. Because Wix manages DNS, update the Wix DNS records using the exact records Netlify gives you.

## Inventory Page

The inventory page is marked `noindex`, but that is not true security. For real privacy, use Netlify password protection, Netlify Identity, or keep the tracker on a separate private app URL and link it from `inventory.html`.
