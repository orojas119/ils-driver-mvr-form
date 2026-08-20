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
  FIXED_REQUEST_INFO: {
    LocationName: "Immaculata La Salle",
    Department: "Admin",
    Address: "3601 S. Miami Ave",
    ContactName: "Arellano, Gaston R",
    ContactEmail: "garellano@ilsroyals.com",
    Phone: "3058542334",
  },
};
