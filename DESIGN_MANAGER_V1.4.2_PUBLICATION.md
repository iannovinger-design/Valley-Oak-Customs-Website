# Valley Oak Design Manager v1.4.2 publication sequence

Status: v1.4.2 website presentation is prepared locally and not deployed. The checked-in stable update endpoint intentionally remains at public v1.4.1 until v1.4.2 is published.

1. Create and validate the GitHub release for tag `v1.4.2`, title `Valley Oak Design Manager v1.4.2`, target `main`, and mark it Latest only when publishing.
2. Attach the approved ZIP, installer, checksum file, Quick Start Guide, and User Manual without rebuilding them.
3. Publish the GitHub release manually.
4. Read the release's exact GitHub `published_at` timestamp and verify every public asset against its approved hash.
5. Update `assets/software/design-manager-latest.json` only after publication:
   - `version`: `1.4.2`
   - `publishedUtc`: exact GitHub `published_at` value
   - `releasePageUrl`: `https://valleyoakcustoms.com/software`
   - `releaseNotesUrl`: `https://github.com/iannovinger-design/Valley-Oak-Design-Manager-Releases/releases/tag/v1.4.2`
6. Update the endpoint regression test with that exact timestamp and v1.4.2 release URL.
7. Run all website tests, commit the timestamp change, and push `main` for Netlify deployment.
8. Verify live `/software`, the JSON endpoint, release notes, ZIP, installer, manuals, and manual Check for Updates behavior.

Prepared download URL:

`https://github.com/iannovinger-design/Valley-Oak-Design-Manager-Releases/releases/download/v1.4.2/Valley_Oak_Customs_Design_Manager_v1.4.2_win-x64.zip`

Do not invent or pre-stage a publication timestamp.
