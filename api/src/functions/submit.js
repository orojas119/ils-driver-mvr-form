const { app } = require("@azure/functions");
const { ALLOWED_ORIGINS, FIXED_REQUEST_INFO } = require("../lib/config");
const { requireMember, AuthError } = require("../lib/auth");
const { validateLicenseFile, UploadError } = require("../lib/uploadValidation");
const { createDriverItem, uploadLicenseFile, uploadMvrPacket } = require("../lib/graph");
const { generateMvrPacket, packetFileName } = require("../lib/pdf");

function corsHeaders(request) {
  const origin = request.headers.get("origin");
  const headers = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-app-access-token",
  };
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

const DRIVER_FIELDS = ["name", "position", "state", "licenseNumber", "dateOfBirth", "signature", "signatureDate"];
const MAX_DRIVERS = 10;

app.http("submitMvr", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "submit",
  handler: async (request, context) => {
    const headers = corsHeaders(request);
    if (request.method === "OPTIONS") {
      return { status: 204, headers };
    }

    let user;
    try {
      user = await requireMember(request);
    } catch (e) {
      if (e instanceof AuthError) return { status: e.status, headers, jsonBody: { error: e.message } };
      throw e;
    }

    try {
      const body = await request.json();

      if (!Array.isArray(body.drivers) || body.drivers.length === 0) {
        return { status: 400, headers, jsonBody: { error: "At least one driver is required." } };
      }
      if (body.drivers.length > MAX_DRIVERS) {
        return { status: 400, headers, jsonBody: { error: `At most ${MAX_DRIVERS} drivers per request.` } };
      }

      const validated = [];
      for (const d of body.drivers) {
        for (const f of DRIVER_FIELDS) {
          if (!d[f] || !String(d[f]).trim()) {
            return { status: 400, headers, jsonBody: { error: `Missing required driver field: ${f}` } };
          }
        }
        if (!d.consentAgreed) {
          return { status: 400, headers, jsonBody: { error: `Driver ${d.name} has not agreed to the authorization.` } };
        }
        let license = null;
        if (d.licenseFileBase64) {
          try {
            license = validateLicenseFile(d.licenseFileName, d.licenseFileBase64);
          } catch (e) {
            if (e instanceof UploadError) return { status: 400, headers, jsonBody: { error: `Driver ${d.name}: ${e.message}` } };
            throw e;
          }
        }
        validated.push({ driver: d, license });
      }

      const dateOfRequest = new Date().toISOString().slice(0, 10);
      let created = 0;
      for (const { driver: d, license } of validated) {
        let licenseFileUrl = "";
        if (license) {
          licenseFileUrl = await uploadLicenseFile(license.safeFileName, license.buffer);
        }

        const packetBytes = await generateMvrPacket({
          requestInfo: FIXED_REQUEST_INFO,
          dateOfRequest,
          driver: d,
          licenseFileName: license ? license.safeFileName : "",
          licenseFileBase64: license ? license.buffer.toString("base64") : "",
        });
        const mvrPacketUrl = await uploadMvrPacket(packetFileName(d.name), packetBytes);

        await createDriverItem({
          Title: d.name,
          ...FIXED_REQUEST_INFO,
          DateOfRequest: dateOfRequest,
          SubmittedByName: user.name || user.email,
          SubmittedByEmail: user.email,
          DriverName: d.name,
          Position: d.position,
          DriverState: d.state,
          LicenseNumber: d.licenseNumber,
          DateOfBirth: d.dateOfBirth,
          Signature: d.signature,
          SignatureDate: d.signatureDate,
          MVRResult: "Pending",
          LicenseFileUrl: licenseFileUrl,
          MVRPacketUrl: mvrPacketUrl,
        });
        created += 1;
      }

      return { status: 200, headers, jsonBody: { success: true, driversCreated: created } };
    } catch (e) {
      context.error(e);
      return { status: 500, headers, jsonBody: { error: "Unexpected server error." } };
    }
  },
});
