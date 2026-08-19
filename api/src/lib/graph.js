const { TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET, SP_SITE_ID, SP_DRIVERMVR_LIST_ID } = require("./config");

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

let cachedToken = null;
let cachedExpiry = 0;

async function getAppToken() {
  if (cachedToken && Date.now() < cachedExpiry - 60_000) return cachedToken;

  const res = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GRAPH_CLIENT_ID,
      client_secret: GRAPH_CLIENT_SECRET,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  if (!res.ok) throw new Error(`Failed to get Graph app token: ${res.status}`);
  const data = await res.json();
  cachedToken = data.access_token;
  cachedExpiry = Date.now() + data.expires_in * 1000;
  return cachedToken;
}

async function graphFetch(path, init = {}, attempt = 0) {
  const token = await getAppToken();
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...init.headers,
    },
  });

  if ((res.status === 429 || res.status === 503) && attempt < 4) {
    const retryAfter = Number(res.headers.get("retry-after")) || 1 + attempt;
    await new Promise((r) => setTimeout(r, retryAfter * 1000));
    return graphFetch(path, init, attempt + 1);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Graph ${init.method || "GET"} ${path} failed: ${res.status} ${body}`);
  }
  return res;
}

const listBase = () => `/sites/${SP_SITE_ID}/lists/${SP_DRIVERMVR_LIST_ID}`;

async function createDriverItem(fields) {
  const res = await graphFetch(`${listBase()}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  });
  return res.json();
}

// Uploads a driver's license photo/scan to the site's default document
// library under /Driver MVR Licenses/, via an upload session (handles both
// small and multi-MB phone-camera photos in one code path). Returns the
// uploaded file's webUrl for storing on the list item.
async function uploadLicenseFile(fileName, base64Content) {
  const buffer = Buffer.from(base64Content, "base64");
  const safeName = `${Date.now()}-${fileName}`.replace(/[^A-Za-z0-9.\-_ ]/g, "_");
  const uploadPath = `/Driver MVR Licenses/${safeName}`;

  const sessionRes = await graphFetch(
    `/sites/${SP_SITE_ID}/drive/root:${encodeURIComponent(uploadPath).replace(/%2F/g, "/")}:/createUploadSession`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item: { "@microsoft.graph.conflictBehavior": "rename" } }),
    }
  );
  const session = await sessionRes.json();

  const uploadRes = await fetch(session.uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Length": String(buffer.length),
      "Content-Range": `bytes 0-${buffer.length - 1}/${buffer.length}`,
    },
    body: buffer,
  });
  if (!uploadRes.ok) {
    const body = await uploadRes.text();
    throw new Error(`License upload failed: ${uploadRes.status} ${body}`);
  }
  const uploaded = await uploadRes.json();
  return uploaded.webUrl;
}

module.exports = { createDriverItem, uploadLicenseFile };
