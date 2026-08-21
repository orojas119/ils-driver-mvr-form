# Driver MVR Request & Authorization Form — Setup

Combines the Archdiocese of Miami "Driver's License MVR Request Approval Form" and
"Authorization to Obtain Motor Vehicle Records" consent form into one online form.

Static HTML + MSAL sign-in, POSTing to a small Azure Function that writes into a
SharePoint list on `ilsforms` via Microsoft Graph (app-only). No Power Automate —
this was tried first but the SharePoint connector needs a one-time interactive OAuth
consent no matter how it's built, so a native Function (same pattern as
`id-image-resizer`, `senior-ipad-swap`, `pictureday-id-lookup`) was used instead.

**Gaston Arellano is the standing point of contact/location for every MVR request**
(confirmed 2026-08-20 — he requested this tool be built). The form has no "Requestor"
step: it's just Drivers → Review. Location/Department/Address/Contact/Phone/CC-contact
are hardcoded server-side (`FIXED_REQUEST_INFO` in `api/src/lib/config.js`, matching
his real reference submission exactly — `ops@ilsroyals.com`, "All school needs", CC to
Sr. Kim Keraitis/principal@ilsroyals.com) so the client can't override them; the actual
signed-in submitter (e.g. a coach) is still tracked separately via
`SubmittedByName`/`SubmittedByEmail` columns.

**Each submission also generates a combined MVR packet PDF** (2026-08-20, per Gaston's
request) — one PDF per driver containing the filled Request Approval Form page, the
Authorization consent page, and the driver's license photo/scan appended, uploaded to
an `MVR` folder in the site's document library. See "PDF packet generation" below.

## Provisioned

**Static site** — repo `orojas119/ils-driver-mvr-form` (public, GitHub Pages, `main`/`/`),
live at both `https://orojas119.github.io/ils-driver-mvr-form/` and
`https://drivermvr.ilsroyals.com/` (DNS CNAME confirmed live, HTTPS certificate
approved and enforced 2026-08-20).

**Entra sign-in app** — `ILS-DriverMVR-WebAuth`
- App (client) ID: `5a24683e-d5cd-406d-827b-74378c4acb35`
- Tenant: `8109e949-d281-46a4-af75-b18087925bf4`
- SPA redirect URIs: `https://drivermvr.ilsroyals.com/`, `http://localhost:8934/`, `http://localhost:8934/index.html`
- Delegated `openid`/`profile`/`email`/`User.Read`, admin-consented. Open to any signed-in
  @ilsroyals.com account (no extra role gating).

**SharePoint list** — `Driver MVR Requests` on `https://ilsroyals.sharepoint.com/sites/ilsforms`
- List ID: `e44aaec2-9089-4498-810e-4819d0bd1b16`
- **One row per driver** (a 3-driver request creates 3 rows sharing the same fixed
  contact fields). Columns: `Title`, `LocationName`, `Department`, `Address`,
  `ContactName`, `ContactEmail`, `Phone`, `DateOfRequest` (date, server-computed),
  `DriverName`, `Position`, `DriverState`, `LicenseNumber`, `DateOfBirth` (date),
  `Signature`, `SignatureDate` (date), `MVRResult` — displayed in SharePoint as
  **"Approval Status"** (choice: Pending/Approved/Declined, renamed 2026-08-20 per
  legal/insurance feedback — this is the "clear record of final approval" of whether
  Gaston has approved or declined the driver on behalf of ADOM, not just the raw MVR
  check result; internal field name `MVRResult` unchanged so no code changes were
  needed — starts `Pending`, Gaston sets it directly in SharePoint after reviewing),
  `LicenseFileUrl` (text — link to the uploaded license photo/scan),
  `SubmittedByName`/`SubmittedByEmail` (text — the actual signed-in submitter, distinct
  from the fixed `ContactName`/`ContactEmail`), `CCContactName`/`CCContactEmail` (now
  populated from the fixed CC constant, not per-submission), `MVRPacketUrl` (text —
  link to the combined packet PDF, see below).
- Driver's license photos/scans are uploaded to the site's default document library
  under `/Driver MVR Licenses/` and linked via `LicenseFileUrl`, rather than stored as
  legacy list-item attachments (Graph v1.0 doesn't support those cleanly).
- **Access:** Graph has no v1.0 API for granting a real user direct list permissions
  (only app-only `Sites.Selected`-style grants) — confirmed by testing `/permissions`
  and `/invite` on the list resource, both rejected. Granting Gaston edit access to
  this list must be done manually in the SharePoint UI (List settings → Permissions
  for this List → Stop Inheriting → Grant Permissions).

**Azure Function API** — `func-drivermvr` (Consumption, Linux, **Node 22**), resource
group `rg-drivermvr`, endpoint `https://func-drivermvr.azurewebsites.net/api/submit`.
Uses the existing **iHelp Graph App** (`b0128bc3-7e7d-4e1a-b8d8-24a045b85e72`) app-only —
it already had `write` granted on the `ilsforms` site, and a dedicated client secret was
issued for this Function. Code lives in `api/`:
- `api/src/functions/submit.js` — HTTP POST handler, validates driver fields, loops
  over `drivers[]`, uploads any license file, creates one list item per driver with
  `FIXED_REQUEST_INFO` spread in plus a server-computed `DateOfRequest`.
- `api/src/lib/graph.js` — app-only token (client-credentials, cached), `graphFetch`
  with 429/503 retry, `uploadFileToDrive` (upload session — handles multi-MB files),
  used by both `uploadLicenseFile` and `uploadMvrPacket`, plus `createDriverItem`.
- `api/src/lib/pdf.js` — `generateMvrPacket()` builds the combined packet with
  `pdf-lib` (no headless browser/LibreOffice dependency — pages are drawn
  programmatically to match the real forms' layout). `packetFileName()` derives
  Gaston's naming convention (last name + first initial, e.g. `GonzalezJ.pdf`) from
  the driver's typed name, handling both "Last, First" and "First Last" input.
  Crest image lives at `api/assets/crest.jpeg` (bundled with the function deploy).
- `api/src/lib/config.js` — env-based settings plus the hardcoded `FIXED_REQUEST_INFO`.
- **CORS is platform-level** (`az functionapp cors add`), not in-code — see gotcha below.

## PDF packet generation

Per driver, `submit.js` now: uploads the raw license file (unchanged) → generates a
combined PDF via `generateMvrPacket()` (Approval form page + Authorization page +
license image/PDF appended) → uploads it to `/MVR/{LastName}{FirstInitial}.pdf` in the
site's document library → stores that URL in `MVRPacketUrl` on the list item.

`appendLicenseFile()` in `pdf.js` handles both cases the form's file input allows:
a JPG/PNG gets embedded as an image page (scaled to fit, centered); an actual PDF
upload gets its pages copied in directly via `PDFDocument.copyPages`.

Verified end-to-end against production 2026-08-20 with a real image upload — packet
downloaded from SharePoint afterward and its pages read back to confirm correct layout
and no corruption; test data deleted afterward.

## Gotchas hit and fixed (2026-08-19/20)

1. **Node 24 wouldn't boot on Linux Consumption.** `syncfunctiontriggers` kept
   returning `ServiceUnavailable from host runtime` for ~10 minutes straight, while
   `publishxml` (site-layer, not host-layer) succeeded the whole time — i.e. the web
   app was up but the language worker wouldn't start. Fixed with
   `az functionapp config set --linux-fx-version "Node|22"` + restart (up within ~60s).
   If a fresh Function App won't come up, check whether `publishxml` succeeds while
   `syncfunctiontriggers` doesn't before assuming it just needs more time.
2. **CORS preflight was silently swallowed by the platform.** Real browser
   cross-origin POSTs (`Content-Type: application/json`) trigger an OPTIONS preflight.
   Azure's platform intercepts OPTIONS before function code runs, **even when
   `"OPTIONS"` is explicitly listed in the trigger's `methods`** — so the in-code CORS
   headers only ever applied to the real POST, never the preflight, and every real
   browser submission failed while `curl` POST tests (no real preflight) kept passing.
   Fixed with `az functionapp cors add --allowed-origins <origins>`. Lesson: test CORS
   with an actual `OPTIONS` request (`curl -X OPTIONS -H "Access-Control-Request-Method: POST"`),
   not just a POST — a passing POST test proves nothing about the preflight.
3. **Application Insights showed zero telemetry** even for confirmed-successful
   requests, hours after deployment — don't rely on it for debugging this app for now;
   reproduce directly against the endpoint instead.

## Local testing
```
python3 -m http.server 8934   # from the repo root
```
Open `http://localhost:8934/index.html?debug=1` to click through the full form without
signing in (bypass only activates on `localhost`). Drop `?debug=1` to test real
Microsoft sign-in.
