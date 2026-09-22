# Valley Oak Design Manager v1.4.1 publication sequence

Status: GitHub release published as Latest at `2026-09-22T01:34:46Z`; website deployment pending.

1. Manually publish the existing GitHub draft for tag `v1.4.1`, title `Valley Oak Design Manager v1.4.1`, target `main`, and mark it Latest.
2. Read the release's exact GitHub `published_at` timestamp after publication.
3. Verify the public ZIP, installer, checksum, Quick Start, and User Manual assets against their approved hashes.
4. Update `assets/software/design-manager-latest.json` only after step 1 succeeds:
   - `version`: `1.4.1`
   - `publishedUtc`: exact GitHub `published_at` value
   - `releasePageUrl`: `https://valleyoakcustoms.com/software`
   - `releaseNotesUrl`: `https://github.com/iannovinger-design/Valley-Oak-Design-Manager-Releases/releases/tag/v1.4.1`
5. Update the endpoint regression test with that exact timestamp and v1.4.1 release URL.
6. Run all website tests, commit the timestamp change, and push `main` for Netlify deployment.
7. Verify live `/software`, the JSON endpoint, release notes, ZIP, installer, manuals, and manual Check for Updates behavior.

Prepared download URL:

`https://github.com/iannovinger-design/Valley-Oak-Design-Manager-Releases/releases/download/v1.4.1/Valley_Oak_Customs_Design_Manager_v1.4.1_win-x64.zip`

The checked-in update endpoint intentionally remains at public v1.4.0 until the GitHub draft is published. Do not invent or pre-stage a publication timestamp.
