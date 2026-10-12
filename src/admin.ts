// Read-only admin API. Every route is behind requireAdmin (see index.ts).
import { HttpError, maskPath, now } from "./http";
import { inviteStatus, type InviteRow } from "./invite-status";

const PAGE = 100;

type SignInRow = { used_at: number | null; attempts: number; expires_at: number; next_path: string };

const withStatus = <T extends SignInRow>(r: T) => ({ ...r, next_path: maskPath(r.next_path), status: signInStatus(r) });

function signInStatus(r: SignInRow): string {
  if (r.used_at) return "verified";
  if (r.attempts >= 5) return "locked";
  if (r.expires_at <= now()) return "expired";
  return "pending";
}

export async function overview(env: Env): Promise<Response> {
  const day = now() - 24 * 3600 * 1000;
  const week = now() - 7 * 24 * 3600 * 1000;
  const row = await env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM users) AS users,
       (SELECT COUNT(*) FROM users WHERE created_at > ?1) AS users_7d,
       (SELECT COUNT(*) FROM users WHERE last_login_at > ?1) AS active_7d,
       (SELECT COUNT(*) FROM groups) AS groups,
       (SELECT COUNT(*) FROM members) AS people,
       (SELECT COUNT(*) FROM members WHERE user_id IS NOT NULL) AS joined_people,
       (SELECT COUNT(*) FROM expenses) AS expenses,
       (SELECT COUNT(*) FROM invites WHERE used_at IS NULL AND revoked_at IS NULL AND expires_at > ?3) AS open_invites,
       (SELECT COALESCE(SUM(use_count), 0) FROM invites) AS link_joins,
       (SELECT COUNT(*) FROM email_log WHERE created_at > ?2) AS emails_24h,
       (SELECT COUNT(*) FROM email_log WHERE created_at > ?2 AND status = 'failed') AS emails_failed_24h,
       (SELECT COUNT(*) FROM login_requests WHERE created_at > ?2) AS signins_24h,
       (SELECT COUNT(*) FROM login_requests WHERE created_at > ?2 AND used_at IS NOT NULL) AS signins_verified_24h`,
  )
    .bind(week, day, now())
    .first();
  return Response.json(row);
}

export async function listUsers(env: Env, url: URL): Promise<Response> {
  const q = `%${(url.searchParams.get("q") ?? "").trim().toLowerCase()}%`;
  const { results } = await env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.created_at, u.last_login_at,
       (SELECT COUNT(*) FROM members WHERE user_id = u.id) AS groups,
       (SELECT COUNT(*) FROM groups WHERE created_by = u.id) AS owned_groups,
       (SELECT COUNT(*) FROM sessions WHERE user_id = u.id AND expires_at > ?2) AS sessions
     FROM users u WHERE lower(u.email) LIKE ?1 OR lower(u.name) LIKE ?1
     ORDER BY u.created_at DESC LIMIT 500`,
  )
    .bind(q, now())
    .all();
  return Response.json(results);
}

export async function getUser(env: Env, userId: string): Promise<Response> {
  const user = await env.DB.prepare("SELECT id, email, name, created_at, last_login_at FROM users WHERE id = ?").bind(userId).first();
  if (!user) throw new HttpError(404, "User not found");
  const [groups, signins, audit] = await env.DB.batch([
    env.DB.prepare(
      `SELECT g.id, g.name, g.currency, g.created_at, g.created_by = ?1 AS is_owner, m.name AS member_name
       FROM members m JOIN groups g ON g.id = m.group_id WHERE m.user_id = ?1 ORDER BY g.created_at DESC`,
    ).bind(userId),
    env.DB.prepare(
      `SELECT r.id, r.created_at, r.expires_at, r.used_at, r.attempts, r.next_path, e.status AS email_status, e.error AS email_error
       FROM login_requests r LEFT JOIN email_log e ON e.login_request_id = r.id
       WHERE r.email = ? ORDER BY r.created_at DESC LIMIT 50`,
    ).bind((user as { email: string }).email),
    env.DB.prepare("SELECT * FROM audit_log WHERE actor_id = ? ORDER BY id DESC LIMIT 100").bind(userId),
  ]);
  return Response.json({
    user,
    groups: groups.results,
    signins: (signins.results as SignInRow[]).map(withStatus),
    audit: audit.results,
  });
}

export async function listGroups(env: Env, url: URL): Promise<Response> {
  const q = `%${(url.searchParams.get("q") ?? "").trim().toLowerCase()}%`;
  const { results } = await env.DB.prepare(
    `SELECT g.id, g.name, g.currency, g.created_at, u.email AS owner_email, u.name AS owner_name,
       (SELECT COUNT(*) FROM members WHERE group_id = g.id) AS people,
       (SELECT COUNT(*) FROM members WHERE group_id = g.id AND user_id IS NOT NULL) AS joined,
       (SELECT COUNT(*) FROM expenses WHERE group_id = g.id) AS expenses,
       COALESCE((SELECT SUM(amount_cents) FROM expenses WHERE group_id = g.id AND kind = 'expense'), 0) AS total,
       (SELECT COUNT(*) FROM invites WHERE group_id = g.id AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?2) AS open_invites
     FROM groups g LEFT JOIN users u ON u.id = g.created_by
     WHERE lower(g.name) LIKE ?1 OR lower(COALESCE(u.email, '')) LIKE ?1
     ORDER BY g.created_at DESC LIMIT 500`,
  )
    .bind(q, now())
    .all();
  return Response.json(results);
}

export async function getGroup(env: Env, groupId: string): Promise<Response> {
  const group = await env.DB.prepare(
    `SELECT g.id, g.name, g.description, g.currency, g.created_at, u.id AS owner_id, u.email AS owner_email, u.name AS owner_name
     FROM groups g LEFT JOIN users u ON u.id = g.created_by WHERE g.id = ?`,
  )
    .bind(groupId)
    .first();
  if (!group) throw new HttpError(404, "Group not found");
  const [people, invites, audit] = await env.DB.batch([
    env.DB.prepare(
      `SELECT m.id, m.name, m.created_at, u.id AS user_id, u.email, u.last_login_at,
         COALESCE((SELECT SUM(amount_cents) FROM expenses WHERE paid_by = m.id), 0)
           - COALESCE((SELECT SUM(amount_cents) FROM expense_shares WHERE member_id = m.id), 0) AS balance
       FROM members m LEFT JOIN users u ON u.id = m.user_id WHERE m.group_id = ? ORDER BY m.created_at`,
    ).bind(groupId),
    env.DB.prepare(
      `SELECT i.*, cu.email AS created_by_email, uu.email AS used_by_email
       FROM invites i LEFT JOIN users cu ON cu.id = i.created_by LEFT JOIN users uu ON uu.id = i.used_by
       WHERE i.group_id = ? ORDER BY i.created_at DESC`,
    ).bind(groupId),
    env.DB.prepare("SELECT * FROM audit_log WHERE group_id = ? ORDER BY id DESC LIMIT 200").bind(groupId),
  ]);
  return Response.json({
    group,
    people: people.results,
    // Tokens are left out: the admin view is for tracking, not for joining groups.
    invites: (invites.results as (InviteRow & Record<string, unknown>)[]).map(({ token: _token, ...i }) => ({ ...i, status: inviteStatus(i) })),
    audit: audit.results,
  });
}

export async function listSignIns(env: Env, url: URL): Promise<Response> {
  const q = `%${(url.searchParams.get("q") ?? "").trim().toLowerCase()}%`;
  const { results } = await env.DB.prepare(
    `SELECT r.id, r.email, r.created_at, r.expires_at, r.used_at, r.attempts, r.next_path,
       e.status AS email_status, e.error AS email_error, e.message_id, u.id AS user_id,
       (r.used_at IS NOT NULL AND u.created_at BETWEEN r.created_at AND r.used_at + 5000) AS registered
     FROM login_requests r LEFT JOIN email_log e ON e.login_request_id = r.id LEFT JOIN users u ON u.email = r.email
     WHERE r.email LIKE ?1 ORDER BY r.created_at DESC LIMIT 300`,
  )
    .bind(q)
    .all<SignInRow & Record<string, unknown>>();
  return Response.json(results.map(withStatus));
}

export async function listAudit(env: Env, url: URL): Promise<Response> {
  const where: string[] = [];
  const binds: (string | number)[] = [];
  const action = url.searchParams.get("action");
  const actor = url.searchParams.get("actor");
  const group = url.searchParams.get("group");
  const before = Number(url.searchParams.get("before"));
  if (action) {
    where.push("a.action LIKE ?");
    binds.push(`${action}%`);
  }
  if (actor) {
    where.push("(a.actor_id = ? OR a.actor_email LIKE ?)");
    binds.push(actor, `%${actor.toLowerCase()}%`);
  }
  if (group) {
    where.push("a.group_id = ?");
    binds.push(group);
  }
  if (Number.isSafeInteger(before) && before > 0) {
    where.push("a.id < ?");
    binds.push(before);
  }
  const { results } = await env.DB.prepare(
    `SELECT a.*, g.name AS group_name FROM audit_log a LEFT JOIN groups g ON g.id = a.group_id
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY a.id DESC LIMIT ${PAGE}`,
  )
    .bind(...binds)
    .all<{ id: number }>();
  return Response.json({ entries: results, next: results.length === PAGE ? results[results.length - 1].id : null });
}
