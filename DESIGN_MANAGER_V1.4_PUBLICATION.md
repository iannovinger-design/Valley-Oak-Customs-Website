# Valley Oak Design Manager v1.4.0 publication sequence

Status: prepared locally; not published or deployed.

1. Create or finish the unpublished GitHub draft release for tag `v1.4.0` and title `Valley Oak Design Manager v1.4.0`.
2. Attach the approved ZIP, standalone installer, and checksum file. Reverify their SHA-256 values against the release record.
3. Publish the GitHub release. This creates the public tag/release and establishes GitHub's actual `publishedAt` timestamp.
4. Read the exact GitHub `publishedAt` value. Do not estimate or backdate it.
5. Update `assets/software/design-manager-latest.json` to:
   - `version`: `1.4.0`
   - `publishedUtc`: the exact GitHub `publishedAt` value from step 4
   - `releaseNotesUrl`: `https://github.com/iannovinger-design/Valley-Oak-Design-Manager-Releases/releases/tag/v1.4.0`
6. Confirm the prepared `/software` links resolve to:
   - `https://github.com/iannovinger-design/Valley-Oak-Design-Manager-Releases/releases/download/v1.4.0/Valley_Oak_Customs_Design_Manager_v1.4.0_win-x64.zip`
   - `https://github.com/iannovinger-design/Valley-Oak-Design-Manager-Releases/releases/tag/v1.4.0`
7. Update the endpoint test with that same actual timestamp, run all website tests, and commit the timestamp update.
8. Push/deploy the website repository only after the GitHub release and all public asset URLs have been verified.
9. Verify the live `/software` page, JSON update endpoint, ZIP download, release notes, and application manual Check for Updates behavior.

Until step 3 completes, the checked-in update endpoint intentionally continues to advertise public stable v1.3.1. The prepared `/software` page changes must not be deployed independently before the GitHub release is public.
