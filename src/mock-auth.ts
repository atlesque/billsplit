// Test-user sign-in, for staging only.
//
// On staging people pick a seeded test user instead of signing in by email. Three things keep this
// off production:
// - it only runs when STAGING is "true", a var only the staging environment in wrangler.jsonc sets;
// - every staging request needs a valid Cloudflare Access assertion (index.ts, and again here);
// - it only signs in accounts on the reserved .test domain, which can never receive a sign-in
//   email, so no real account can be signed into this way.

import { verifyAccess } from "./access";
import { safeNext, startSession, type User } from "./auth";
import { HttpError, readJson, text } from "./http";

export const TEST_EMAIL_DOMAIN = "@billsplit.test";

export function isStaging(env: Env): boolean {
  return env.STAGING === "true";
}

async function requireStaging(request: Request, env: Env): Promise<void> {
  if (!isStaging(env)) throw new HttpError(404, "Not found");
  await verifyAccess(request, env);
}

const TEST_USERS_SQL = `SELECT id, email, name FROM users WHERE email LIKE '%' || ? ORDER BY name = '', name, email`;

export async function listTestUsers(request: Request, env: Env): Promise<Response> {
  await requireStaging(request, env);
  const { results } = await env.DB.prepare(TEST_USERS_SQL).bind(TEST_EMAIL_DOMAIN).all<User>();
  return Response.json({ users: results });
}

export async function mockSignIn(request: Request, env: Env): Promise<Response> {
  await requireStaging(request, env);
  const body = await readJson(request);
  const userId = text(body.userId, "Test user", { max: 64 });
  const user = await env.DB.prepare("SELECT id, email, name FROM users WHERE id = ?").bind(userId).first<User>();
  if (!user || !user.email.endsWith(TEST_EMAIL_DOMAIN)) throw new HttpError(400, "Pick one of the test users");
  return startSession(request, env, user, { target: user.id, method: "test_user", isNew: false, next: safeNext(body.next) });
}
