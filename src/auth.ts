import { HttpError, now, randomId, readJson, sha256, text } from "./http";

const SESSION_COOKIE = "bs_session";
const SESSION_TTL = 90 * 24 * 3600 * 1000;
const LOGIN_TTL = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_REQUESTS_PER_WINDOW = 5;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type User = { id: string; email: string; name: string };

function sessionCookie(token: string, maxAgeSeconds: number): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("Cookie") ?? "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

export async function currentUser(request: Request, env: Env): Promise<User | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  return env.DB.prepare(
    `SELECT u.id, u.email, u.name FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`,
  )
    .bind(await sha256(token), now())
    .first<User>();
}

export async function requireUser(request: Request, env: Env): Promise<User> {
  const user = await currentUser(request, env);
  if (!user) throw new HttpError(401, "Please sign in");
  return user;
}

function safeNext(value: unknown): string {
  // Only same-origin app paths, never protocol-relative URLs.
  return typeof value === "string" && /^\/(?!\/)[\w\-/.?=&%]*$/.test(value) ? value : "/";
}

export async function startLogin(request: Request, env: Env): Promise<Response> {
  const body = await readJson(request);
  const email = text(body.email, "Email", { max: 254 }).toLowerCase();
  if (!EMAIL_RE.test(email)) throw new HttpError(400, "Enter a valid email address");
  const next = safeNext(body.next);

  const recent = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM login_requests WHERE email = ? AND created_at > ?",
  )
    .bind(email, now() - LOGIN_TTL)
    .first<{ n: number }>();
  if ((recent?.n ?? 0) >= MAX_REQUESTS_PER_WINDOW) {
    throw new HttpError(429, "Too many sign-in emails. Wait a few minutes and try again.");
  }

  const id = randomId();
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
  const linkToken = randomId(24);
  await env.DB.prepare(
    `INSERT INTO login_requests (id, email, code_hash, link_hash, next_path, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, email, await sha256(`${id}:${code}`), await sha256(linkToken), next, now() + LOGIN_TTL, now())
    .run();

  const link = `${env.APP_URL}/signin?token=${linkToken}`;
  try {
    await env.EMAIL.send({
      to: email,
      from: { email: env.EMAIL_FROM, name: "BillSplit" },
      subject: `${code} is your BillSplit sign-in code`,
      text: `Your BillSplit sign-in code is ${code}\n\nOr sign in with this link:\n${link}\n\nThe code and link expire in 15 minutes. If you didn't ask for this, you can ignore this email.`,
      html: loginEmailHtml(code, link),
    });
  } catch (error) {
    const e = error as { code?: string; message?: string };
    console.error("Sign-in email failed", e.code, e.message);
    throw new HttpError(502, "Could not send the sign-in email. Try again in a moment.");
  }
  return Response.json({ requestId: id, email });
}

function loginEmailHtml(code: string, link: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1d2433">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#fff;border-radius:14px;padding:32px">
<tr><td style="font-size:20px;font-weight:700;padding-bottom:8px">BillSplit</td></tr>
<tr><td style="font-size:15px;line-height:1.5;padding-bottom:20px">Enter this code to sign in:</td></tr>
<tr><td style="font-size:34px;font-weight:700;letter-spacing:8px;padding-bottom:24px;font-family:Menlo,Consolas,monospace">${code}</td></tr>
<tr><td style="padding-bottom:24px"><a href="${link}" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px">Sign in to BillSplit</a></td></tr>
<tr><td style="font-size:13px;color:#667085;line-height:1.5">The code and link expire in 15 minutes. If you didn't ask for this, you can ignore this email.</td></tr>
</table></td></tr></table></body></html>`;
}

type LoginRow = { id: string; email: string; code_hash: string; attempts: number; next_path: string };

async function completeLogin(env: Env, row: LoginRow): Promise<Response> {
  // Mark used atomically so a code or link can only ever be redeemed once.
  const claimed = await env.DB.prepare("UPDATE login_requests SET used_at = ? WHERE id = ? AND used_at IS NULL")
    .bind(now(), row.id)
    .run();
  if (!claimed.meta.changes) throw new HttpError(400, "This sign-in was already used. Request a new code.");

  await env.DB.prepare("INSERT OR IGNORE INTO users (id, email, name, created_at) VALUES (?, ?, '', ?)")
    .bind(randomId(), row.email, now())
    .run();
  const user = await env.DB.prepare("SELECT id, email, name FROM users WHERE email = ?").bind(row.email).first<User>();
  if (!user) throw new HttpError(500, "Could not create account");

  const token = randomId(32);
  await env.DB.prepare("INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .bind(await sha256(token), user.id, now() + SESSION_TTL, now())
    .run();
  return Response.json(
    { user, next: row.next_path },
    { headers: { "Set-Cookie": sessionCookie(token, SESSION_TTL / 1000) } },
  );
}

export async function verifyCode(request: Request, env: Env): Promise<Response> {
  const body = await readJson(request);
  const requestId = text(body.requestId, "Request", { max: 64 });
  const code = text(body.code, "Code", { max: 12 }).replace(/\D/g, "");

  const row = await env.DB.prepare(
    `SELECT id, email, code_hash, attempts, next_path FROM login_requests
     WHERE id = ? AND used_at IS NULL AND expires_at > ?`,
  )
    .bind(requestId, now())
    .first<LoginRow>();
  if (!row) throw new HttpError(400, "This code has expired. Request a new one.");
  if (row.attempts >= MAX_ATTEMPTS) throw new HttpError(429, "Too many wrong codes. Request a new one.");

  if ((await sha256(`${row.id}:${code}`)) !== row.code_hash) {
    await env.DB.prepare("UPDATE login_requests SET attempts = attempts + 1 WHERE id = ?").bind(row.id).run();
    const left = MAX_ATTEMPTS - row.attempts - 1;
    throw new HttpError(400, left > 0 ? `Wrong code. ${left} attempt${left === 1 ? "" : "s"} left.` : "Too many wrong codes. Request a new one.");
  }
  return completeLogin(env, row);
}

export async function verifyLink(request: Request, env: Env): Promise<Response> {
  const body = await readJson(request);
  const token = text(body.token, "Token", { max: 128 });
  const row = await env.DB.prepare(
    `SELECT id, email, code_hash, attempts, next_path FROM login_requests
     WHERE link_hash = ? AND used_at IS NULL AND expires_at > ?`,
  )
    .bind(await sha256(token), now())
    .first<LoginRow>();
  if (!row) throw new HttpError(400, "This sign-in link has expired or was already used.");
  return completeLogin(env, row);
}

export async function logout(request: Request, env: Env): Promise<Response> {
  const token = readCookie(request, SESSION_COOKIE);
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
  return new Response(null, { status: 204, headers: { "Set-Cookie": sessionCookie("", 0) } });
}

export async function updateProfile(request: Request, env: Env, user: User): Promise<Response> {
  const body = await readJson(request);
  const name = text(body.name, "Name", { max: 60 });
  await env.DB.prepare("UPDATE users SET name = ? WHERE id = ?").bind(name, user.id).run();
  return Response.json({ ...user, name });
}

export async function cleanup(env: Env): Promise<void> {
  const cutoff = now() - 24 * 3600 * 1000;
  await env.DB.batch([
    env.DB.prepare("DELETE FROM login_requests WHERE expires_at < ?").bind(cutoff),
    env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now()),
  ]);
}
