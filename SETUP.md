# Driver MVR Request & Authorization Form — Setup

Combines the Archdiocese of Miami "Driver's License MVR Request Approval Form" and
"Authorization to Obtain Motor Vehicle Records" consent form into one online form.
Architecture mirrors `ils-po-form`: static HTML + MSAL sign-in + Power Automate HTTP
trigger writing into a SharePoint list. No backend/API to host.

## Already provisioned (2026-08-19)

**Entra sign-in app** — `ILS-DriverMVR-WebAuth`
- App (client) ID: `5a24683e-d5cd-406d-827b-74378c4acb35`
- Tenant: `8109e949-d281-46a4-af75-b18087925bf4`
- SPA redirect URIs: `https://drivermvr.ilsroyals.com/`, `http://localhost:8934/`, `http://localhost:8934/index.html`
- Delegated permissions (admin-consented): `openid`, `profile`, `email`, `User.Read`
- Already wired into `index.html`'s `MSAL_CONFIG`.

**SharePoint list** — `Driver MVR Requests` on the `ilsforms` site
- Site: `https://ilsroyals.sharepoint.com/sites/ilsforms`
- List ID: `e44aaec2-9089-4498-810e-4819d0bd1b16`
- List URL: https://ilsroyals.sharepoint.com/sites/ilsforms/Lists/Driver%20MVR%20Requests
- **One row per driver** (a request with 3 drivers creates 3 list items sharing the same
  location/request fields). Columns:
  - `Title` — default; not populated automatically, Power Automate should set it to the driver's name
  - `LocationName`, `Department`, `Address`, `ContactName`, `ContactEmail`, `Phone` (text)
  - `DateOfRequest` (date only)
  - `CCContactName`, `CCContactEmail` (text, may be blank)
  - `DriverName`, `Position`, `DriverState`, `LicenseNumber` (text)
  - `DateOfBirth`, `SignatureDate` (date only)
  - `Signature` (text — typed e-signature)
  - `MVRResult` (choice: `Pending` / `Clear` / `Flagged` — left as `Pending` on creation;
    Pastoral Center staff update this directly in SharePoint after processing)

## What's left to do

### 1. Build the Power Automate flow (manual — do this in the Power Automate UI)

Create a new **Instant cloud flow** triggered by **"When an HTTP request is received"**.

Request body JSON schema:

```json
{
  "type": "object",
  "properties": {
    "locationName": { "type": "string" },
    "department": { "type": "string" },
    "address": { "type": "string" },
    "contactName": { "type": "string" },
    "email": { "type": "string" },
    "phone": { "type": "string" },
    "dateOfRequest": { "type": "string" },
    "ccContactName": { "type": "string" },
    "ccContactEmail": { "type": "string" },
    "drivers": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": { "type": "string" },
          "position": { "type": "string" },
          "state": { "type": "string" },
          "licenseNumber": { "type": "string" },
          "dateOfBirth": { "type": "string" },
          "signature": { "type": "string" },
          "signatureDate": { "type": "string" },
          "consentAgreed": { "type": "boolean" },
          "licenseFileName": { "type": "string" },
          "licenseFileBase64": { "type": "string" }
        }
      }
    }
  }
}
```

Then:
1. **Apply to each** — over `triggerBody()?['drivers']`.
2. Inside the loop, **Create item** (SharePoint "Get item"/"Create item" connector) on
   site `ilsforms`, list `Driver MVR Requests`, mapping:
   - `Title` → `items('Apply_to_each')?['name']`
   - `LocationName`/`Department`/`Address`/`ContactName`/`ContactEmail`/`Phone`/`DateOfRequest`/`CCContactName`/`CCContactEmail` → the matching top-level trigger fields
   - `DriverName` → `items('Apply_to_each')?['name']`
   - `Position`, `DriverState` (→ `state`), `LicenseNumber`, `DateOfBirth`, `Signature`, `SignatureDate` → matching driver fields
   - `MVRResult` → `Pending`
3. Still inside the loop, **Add attachment** (SharePoint) on the item just created, using
   `items('Apply_to_each')?['licenseFileName']` as file name and
   `base64ToBinary(items('Apply_to_each')?['licenseFileBase64'])` as file content — this
   attaches the driver's license photo/scan to that driver's row (replaces the old
   "fax a copy of the license" step).
4. After the loop, respond **200 OK** (Response action) so the form shows success.
5. Optional but recommended: add a **Send an email (V2)** step notifying
   `mrancano@theadom.org` (and `ccContactEmail` if present) that a new MVR request came in,
   listing the drivers — mirrors the original fax workflow's intent.

Once the flow is saved, copy its **HTTP POST URL** and paste it into `index.html` as
`POWER_AUTOMATE_URL` (near the top of the `<script>` block), replacing
`"REPLACE_WITH_POWER_AUTOMATE_HTTP_TRIGGER_URL"`.

### 2. DNS

Add a CNAME record: `drivermvr.ilsroyals.com` → `orojas119.github.io` (same pattern as
`po.ilsroyals.com`). GitHub Pages won't serve the custom domain over HTTPS until this
propagates and GitHub verifies it.

### 3. Local testing

`python3 -m http.server 8934` from this directory, then open
`http://localhost:8934/index.html?debug=1` to click through the full form without signing
in (debug bypass only activates on `localhost`). Drop `?debug=1` to test the real
Microsoft sign-in flow locally.
