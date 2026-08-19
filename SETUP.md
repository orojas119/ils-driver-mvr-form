# Driver MVR Request & Authorization Form — Setup

Combines the Archdiocese of Miami "Driver's License MVR Request Approval Form" and
"Authorization to Obtain Motor Vehicle Records" consent form into one online form.

Static HTML + MSAL sign-in, POSTing to a small Azure Function that writes into a
SharePoint list on `ilsforms` via Microsoft Graph (app-only). No Power Automate —
this was tried first but the SharePoint connector needs a one-time interactive OAuth
consent no matter how it's built, so a native Function (same pattern as
`id-image-resizer`, `senior-ipad-swap`, `pictureday-id-lookup`) was used instead.

## Provisioned (2026-08-19)

**Static site** — repo `orojas119/ils-driver-mvr-form` (public, GitHub Pages, `main`/`/`).
Live now at `https://orojas119.github.io/ils-driver-mvr-form/`, will also serve at
`https://drivermvr.ilsroyals.com/` once the CNAME DNS record (`drivermvr` →
`orojas119.github.io`) propagates.

**Entra sign-in app** — `ILS-DriverMVR-WebAuth`
- App (client) ID: `5a24683e-d5cd-406d-827b-74378c4acb35`
- Tenant: `8109e949-d281-46a4-af75-b18087925bf4`
- SPA redirect URIs: `https://drivermvr.ilsroyals.com/`, `http://localhost:8934/`, `http://localhost:8934/index.html`
- Delegated `openid`/`profile`/`email`/`User.Read`, admin-consented. Open to any signed-in
  @ilsroyals.com account (no extra role gating) — already wired into `index.html`.

**SharePoint list** — `Driver MVR Requests` on `https://ilsroyals.sharepoint.com/sites/ilsforms`
- List ID: `e44aaec2-9089-4498-810e-4819d0bd1b16`
- **One row per driver** (a 3-driver request creates 3 rows sharing the same
  location/request fields). Columns: `Title`, `LocationName`, `Department`, `Address`,
  `ContactName`, `ContactEmail`, `Phone`, `DateOfRequest` (date), `CCContactName`,
  `CCContactEmail`, `DriverName`, `Position`, `DriverState`, `LicenseNumber`,
  `DateOfBirth` (date), `Signature`, `SignatureDate` (date), `MVRResult` (choice:
  Pending/Clear/Flagged — starts `Pending`, Pastoral Center staff update it directly in
  SharePoint after processing), `LicenseFileUrl` (text — link to the uploaded license
  photo/scan).
- Driver's license photos/scans are uploaded to the site's default document library
  under `/Driver MVR Licenses/` and linked via `LicenseFileUrl`, rather than stored as
  legacy list-item attachments (Graph v1.0 doesn't support those cleanly).

**Azure Function API** — `func-drivermvr` (Consumption, Linux, Node 24), resource group
`rg-drivermvr`, endpoint `https://func-drivermvr.azurewebsites.net/api/submit`. Uses the
existing **iHelp Graph App** (`b0128bc3-7e7d-4e1a-b8d8-24a045b85e72`) app-only —
it already has `write` granted on the `ilsforms` site (confirmed via
`GET /sites/{id}/permissions`, no new consent needed), and a **new client secret** was
issued for it specifically for this Function (2-year expiry). Code lives in `api/` in
this repo:
- `api/src/functions/submit.js` — HTTP POST handler, validates required fields, loops
  over `drivers[]`, uploads any license file, creates one list item per driver.
- `api/src/lib/graph.js` — app-only token (client-credentials, cached), `graphFetch`
  with 429/503 retry, `uploadLicenseFile` (upload session — handles multi-MB
  phone-camera photos), `createDriverItem`.
- `api/src/lib/config.js` — reads all of the above from Function App settings
  (`AZURE_AD_TENANT_ID`, `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`, `SP_SITE_ID`,
  `SP_DRIVERMVR_LIST_ID`, `ALLOWED_ORIGINS`) — already set on `func-drivermvr`.
- CORS is handled in code (`ALLOWED_ORIGINS` allowlist), not the platform CORS setting.

Tested end-to-end locally (both the plain-fields path and the license-file-upload path)
against the real SharePoint list before deploying; test rows were deleted afterward.

## What's left to do

### 1. DNS (in progress)
CNAME `drivermvr` → `orojas119.github.io`, requested from IT 2026-08-19. Once it
resolves, GitHub auto-issues an HTTPS cert for the custom domain — no action needed
after that.

### 2. Redeploy the Function after the trigger-sync hiccup
The very first `func azure functionapp publish` hit a transient
`ServiceUnavailable` on trigger sync (common right after creating a brand-new Linux
Consumption Function App). Re-run `func azure functionapp publish func-drivermvr`
from `api/` once the app has finished warming up, then confirm with
`az functionapp function list --name func-drivermvr --resource-group rg-drivermvr`.

### 3. Local testing
```
python3 -m http.server 8934   # from the repo root
```
Open `http://localhost:8934/index.html?debug=1` to click through the full form without
signing in (bypass only activates on `localhost`). Drop `?debug=1` to test real
Microsoft sign-in. The form posts to the live Azure Function either way (already CORS
allow-listed for `localhost:8934`).
