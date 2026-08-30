# Valley Oak Customs Website

Canonical static source for `valleyoakcustoms.com`, ready for Git-managed Netlify deployment.

## Files

- `index.html` is the public website.
- `software.html` is the multi-product software landing page.
- `software.js` reads the latest stable Design Manager release from GitHub's public Releases API and falls back safely to the official releases page.
- `assets/software/design-manager-latest.json` is the stable update endpoint consumed by Design Manager's manual Check for Updates action.
- `thanks.html` is the quote form success page.
- `inventory.html` is the reserved private inventory page.
- `assets/shop-hero.jpg` is the temporary website artwork. `assets/shop-hero.png` is kept as the higher-quality source.
- `netlify.toml` tells Netlify to publish this folder as-is.

## Netlify Setup

1. Connect the existing Valley Oak Customs Netlify project to this repository.
2. Use `main` as the production branch, no build command, and `.` as the publish directory.
3. After deploy, Netlify should detect the `quote-request` form automatically.
4. In Netlify, add the custom domain `valleyoakcustoms.com`.
5. Because Wix manages DNS, update the Wix DNS records using the exact records Netlify gives you.

## Local editing

Serve the repository root with any static HTTP server. Do not open the pages only as `file://` URLs because redirects, forms, and browser security behavior differ from Netlify. Review changes on a branch, then merge to `main`; Netlify should deploy `main` automatically after the existing project is connected.

No GitHub token belongs in browser JavaScript. Public software-release metadata is read anonymously from the approved public releases repository.

## Design Manager update endpoint

`assets/software/design-manager-latest.json` always describes the latest approved public stable Design Manager release. RC, private, preview, and unreleased development builds must never be advertised through this endpoint.

Keep the endpoint on the current public version throughout development. Updating it to a new stable version is part of the final production release transaction, after the approved GitHub release and public download are available. Validate the JSON and its URLs before deploying the website change so advancing source code alone can never advertise an unreleased build.

## Inventory Page

The inventory page is marked `noindex`, but that is not true security. For real privacy, use Netlify password protection, Netlify Identity, or keep the tracker on a separate private app URL and link it from `inventory.html`.
