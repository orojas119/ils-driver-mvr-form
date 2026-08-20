module.exports = {
  TENANT_ID: process.env.AZURE_AD_TENANT_ID,
  GRAPH_CLIENT_ID: process.env.AZURE_AD_CLIENT_ID,
  GRAPH_CLIENT_SECRET: process.env.AZURE_AD_CLIENT_SECRET,
  SP_SITE_ID: process.env.SP_SITE_ID,
  SP_DRIVERMVR_LIST_ID: process.env.SP_DRIVERMVR_LIST_ID,
  // Comma-separated list of origins allowed to call this API (the static form's domains).
  ALLOWED_ORIGINS: (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
  // Gaston Arellano is the standing point of contact for every MVR request
  // (confirmed 2026-08-20) — fixed server-side so the client can't override it.
  // Values match his real reference submission (GonzalezJ.pdf, 2026-08-20) exactly,
  // not his own quick test of the form (which had placeholder values).
  FIXED_REQUEST_INFO: {
    LocationName: "Immaculata-La Salle High School",
    Department: "All school needs",
    Address: "3601 S. Miami Avenue, Miami, FL 33133",
    ContactName: "Gaston Arellano",
    ContactEmail: "ops@ilsroyals.com",
    Phone: "305-854-2334 ext2240",
    CCContactName: "Sr. Kim Keraitis, FMA",
    CCContactEmail: "principal@ilsroyals.com",
  },
};
