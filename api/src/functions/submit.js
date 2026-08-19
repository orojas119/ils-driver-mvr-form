const { app } = require("@azure/functions");
const { ALLOWED_ORIGINS } = require("../lib/config");
const { createDriverItem, uploadLicenseFile } = require("../lib/graph");

function corsHeaders(request) {
  const origin = request.headers.get("origin");
  const headers = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

const REQUEST_FIELDS = ["locationName", "department", "address", "contactName", "email", "phone", "dateOfRequest"];
const DRIVER_FIELDS = ["name", "position", "state", "licenseNumber", "dateOfBirth", "signature", "signatureDate"];

app.http("submitMvr", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "submit",
  handler: async (request, context) => {
    const headers = corsHeaders(request);
    if (request.method === "OPTIONS") {
      return { status: 204, headers };
    }

    try {
      const body = await request.json();

      for (const f of REQUEST_FIELDS) {
        if (!body[f] || !String(body[f]).trim()) {
          return { status: 400, headers, jsonBody: { error: `Missing required field: ${f}` } };
        }
      }
      if (!Array.isArray(body.drivers) || body.drivers.length === 0) {
        return { status: 400, headers, jsonBody: { error: "At least one driver is required." } };
      }
      for (const d of body.drivers) {
        for (const f of DRIVER_FIELDS) {
          if (!d[f] || !String(d[f]).trim()) {
            return { status: 400, headers, jsonBody: { error: `Missing required driver field: ${f}` } };
          }
        }
        if (!d.consentAgreed) {
          return { status: 400, headers, jsonBody: { error: `Driver ${d.name} has not agreed to the authorization.` } };
        }
      }

      let created = 0;
      for (const d of body.drivers) {
        let licenseFileUrl = "";
        if (d.licenseFileBase64 && d.licenseFileName) {
          licenseFileUrl = await uploadLicenseFile(d.licenseFileName, d.licenseFileBase64);
        }

        await createDriverItem({
          Title: d.name,
          LocationName: body.locationName,
          Department: body.department,
          Address: body.address,
          ContactName: body.contactName,
          ContactEmail: body.email,
          Phone: body.phone,
          DateOfRequest: body.dateOfRequest,
          CCContactName: body.ccContactName || "",
          CCContactEmail: body.ccContactEmail || "",
          DriverName: d.name,
          Position: d.position,
          DriverState: d.state,
          LicenseNumber: d.licenseNumber,
          DateOfBirth: d.dateOfBirth,
          Signature: d.signature,
          SignatureDate: d.signatureDate,
          MVRResult: "Pending",
          LicenseFileUrl: licenseFileUrl,
        });
        created += 1;
      }

      return { status: 200, headers, jsonBody: { success: true, driversCreated: created } };
    } catch (e) {
      context.error(e);
      return { status: 500, headers, jsonBody: { error: e.message || "Unexpected server error." } };
    }
  },
});
