// Cloudflare Access check for the admin API.
//
// Access protects /admin and /api/admin/* at the edge. The Worker also verifies the signed
// assertion, so an admin request that somehow bypasses Access is still refused.

import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { HttpError } from "./http";

const jwksByTeam = new Map<string, JWTVerifyGetKey>();

/** Returns the email Access verified. Fails closed when Access isn't configured. */
export async function verifyAccess(request: Request, env: Env): Promise<string> {
  const team = env.ACCESS_TEAM_DOMAIN?.replace(/\/$/, "");
  if (!team || !env.ACCESS_AUD) {
    // Local development only (.dev.vars is never deployed); ignored once Access is configured.
    if (env.DEV_DISABLE_ACCESS === "true") return "dev@localhost";
    throw new HttpError(404, "Not found");
  }
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) throw new HttpError(403, "Missing Cloudflare Access assertion");

  let jwks = jwksByTeam.get(team);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${team}/cdn-cgi/access/certs`));
    jwksByTeam.set(team, jwks);
  }
  try {
    const { payload } = await jwtVerify(token, jwks, { issuer: team, audience: env.ACCESS_AUD });
    if (typeof payload.email !== "string") throw new Error("no email");
    return payload.email.toLowerCase();
  } catch {
    throw new HttpError(403, "Invalid Cloudflare Access assertion");
  }
}
