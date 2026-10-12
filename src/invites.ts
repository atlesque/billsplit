import { audit } from "./audit";
import { currentUser, type User } from "./auth";
import { groupForUser, insertMember, members } from "./groups";
import { HttpError, now, randomId, readJson, text } from "./http";
import { inviteStatus, type InviteRow } from "./invite-status";

const INVITE_TTL = 30 * 24 * 3600 * 1000;

/**
 * Creates a single-use invite link. With `memberId` the link is for that (not yet joined) person,
 * and an existing active link for them is returned instead of creating a second one.
 */
export async function createInvite(request: Request, env: Env, user: User, groupId: string): Promise<Response> {
  await groupForUser(env, groupId, user);
  const body = await readJson(request);
  let memberId: string | null = null;
  let label = "";
  if (typeof body.memberId === "string") {
    const member = await env.DB.prepare("SELECT id, name, user_id FROM members WHERE id = ? AND group_id = ?")
      .bind(body.memberId, groupId)
      .first<{ id: string; name: string; user_id: string | null }>();
    if (!member) throw new HttpError(404, "Person not found");
    if (member.user_id) throw new HttpError(400, `${member.name} has already joined`);
    const existing = await env.DB.prepare(
      "SELECT token FROM invites WHERE member_id = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?",
    )
      .bind(member.id, now())
      .first<{ token: string }>();
    if (existing) return Response.json({ token: existing.token, label: member.name });
    memberId = member.id;
    label = member.name;
  }
  const id = randomId();
  const token = randomId(18);
  await env.DB.prepare(
    "INSERT INTO invites (id, group_id, token, member_id, label, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(id, groupId, token, memberId, label, user.id, now(), now() + INVITE_TTL)
    .run();
  await audit(env, request, user, "invite.created", { groupId, target: id, details: { for: label || null } });
  return Response.json({ token, label }, { status: 201 });
}

export async function revokeInvite(request: Request, env: Env, user: User, groupId: string, inviteId: string) {
  await groupForUser(env, groupId, user);
  const res = await env.DB.prepare(
    "UPDATE invites SET revoked_at = ? WHERE id = ? AND group_id = ? AND used_at IS NULL AND revoked_at IS NULL",
  )
    .bind(now(), inviteId, groupId)
    .run();
  if (!res.meta.changes) throw new HttpError(400, "This invite can no longer be revoked");
  await audit(env, request, user, "invite.revoked", { groupId, target: inviteId });
  return new Response(null, { status: 204 });
}

async function inviteByToken(env: Env, token: string) {
  const invite = await env.DB.prepare(
    `SELECT i.*, g.name AS group_name, g.description AS group_description, u.name AS inviter
     FROM invites i JOIN groups g ON g.id = i.group_id LEFT JOIN users u ON u.id = i.created_by
     WHERE i.token = ?`,
  )
    .bind(token)
    .first<InviteRow & { group_name: string; group_description: string; inviter: string | null }>();
  if (!invite) throw new HttpError(404, "This invite link doesn't exist. Check the link or ask for a new one.");
  return invite;
}

/** Public: shows what the invite is for, so a signed-out visitor knows what they're signing in to. */
export async function getInvite(request: Request, env: Env, token: string): Promise<Response> {
  const invite = await inviteByToken(env, token);
  const user = await currentUser(request, env);
  const status = inviteStatus(invite);
  const base = {
    status,
    group: { name: invite.group_name, description: invite.group_description },
    invitedBy: invite.inviter,
    forName: invite.label || null,
    signedIn: Boolean(user),
  };
  if (!user) return Response.json(base);

  const mine = await env.DB.prepare("SELECT id FROM members WHERE group_id = ? AND user_id = ?").bind(invite.group_id, user.id).first();
  if (mine) return Response.json({ ...base, alreadyMember: true, groupId: invite.group_id });
  if (status !== "active") return Response.json({ ...base, alreadyMember: false });

  const memberRows = await members(env, invite.group_id);
  return Response.json({
    ...base,
    alreadyMember: false,
    forMemberId: memberRows.some((m) => m.id === invite.member_id && !m.user_id) ? invite.member_id : null,
    openPeople: memberRows.filter((m) => !m.user_id).map((m) => ({ id: m.id, name: m.name })),
  });
}

/** Joins the group and uses up the invite. Body: { memberId } to join as an existing person, or { name }. */
export async function joinInvite(request: Request, env: Env, user: User, token: string): Promise<Response> {
  const invite = await inviteByToken(env, token);
  const mine = await env.DB.prepare("SELECT id FROM members WHERE group_id = ? AND user_id = ?").bind(invite.group_id, user.id).first();
  if (mine) return Response.json({ id: invite.group_id });

  const status = inviteStatus(invite);
  if (status !== "active") {
    throw new HttpError(410, status === "used" ? "This invite link was already used. Ask for a new one." : "This invite link is no longer valid. Ask for a new one.");
  }

  const body = await readJson(request);
  const t = now();
  // Use up the invite first; only one request can win this update.
  const claimedInvite = await env.DB.prepare(
    "UPDATE invites SET used_at = ?, used_by = ? WHERE id = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?",
  )
    .bind(t, user.id, invite.id, t)
    .run();
  if (!claimedInvite.meta.changes) throw new HttpError(410, "This invite link was just used. Ask for a new one.");

  const release = () => env.DB.prepare("UPDATE invites SET used_at = NULL, used_by = NULL WHERE id = ?").bind(invite.id).run();
  let memberId: string;
  try {
    if (typeof body.memberId === "string") {
      const res = await env.DB.prepare("UPDATE members SET user_id = ? WHERE id = ? AND group_id = ? AND user_id IS NULL")
        .bind(user.id, body.memberId, invite.group_id)
        .run();
      if (!res.meta.changes) throw new HttpError(409, "Someone else already joined as that person. Pick another one.");
      memberId = body.memberId;
    } else {
      memberId = await insertMember(env, invite.group_id, text(body.name ?? user.name, "Your name", { max: 60 }), user.id);
    }
  } catch (error) {
    await release();
    throw error;
  }
  // Any other open invite for the person just claimed is no longer needed.
  await env.DB.prepare("UPDATE invites SET revoked_at = ? WHERE member_id = ? AND id != ? AND used_at IS NULL AND revoked_at IS NULL")
    .bind(t, memberId, invite.id)
    .run();
  await audit(env, request, user, "invite.used", {
    groupId: invite.group_id,
    target: invite.id,
    details: { memberId, invitedFor: invite.label || null, joinedAs: typeof body.memberId === "string" ? "existing" : "new" },
  });
  return Response.json({ id: invite.group_id });
}
