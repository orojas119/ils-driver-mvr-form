const { jwtVerify, createRemoteJWKSet } = require("jose");
const { TENANT_ID, WEBAUTH_CLIENT_ID, ALLOWED_DOMAIN } = require("./config");

const issuer = `https://login.microsoftonline.com/${TENANT_ID}/v2.0`;
const jwks = createRemoteJWKSet(
  new URL(`https://login.microsoftonline.com/${TENANT_ID}/discovery/v2.0/keys`)
);

class AuthError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function requireMember(request) {
  const token = request.headers.get("x-app-access-token");
  if (!token) throw new AuthError(401, "Missing access token");

  let payload;
  try {
    ({ payload } = await jwtVerify(token, jwks, {
      issuer,
      audience: [WEBAUTH_CLIENT_ID, `api://${WEBAUTH_CLIENT_ID}`],
    }));
  } catch {
    throw new AuthError(401, "Invalid or expired access token");
  }

  if (!payload.scp || !payload.scp.split(" ").includes("access_as_user")) {
    throw new AuthError(401, "Token missing required scope");
  }

  const email = (payload.preferred_username || payload.upn || "").toLowerCase();
  if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) {
    throw new AuthError(403, `Only @${ALLOWED_DOMAIN} accounts may use this form`);
  }

  return { email, name: payload.name || "" };
}

module.exports = { AuthError, requireMember };
