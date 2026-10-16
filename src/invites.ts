import { audit } from "./audit";
import { currentUser, type User } from "./auth";
import { insertMember, members, requireGroupManager } from "./groups";
import { HttpError, now, randomId, readJson, text } from "./http";
import { inviteStatus, type InviteRow } from "./invite-status";

// Group share links don't expire on their own; resetting the link is how you end one.
const NEVER = 253402300799000;

/** Inserts a new share link for the group and returns its token. */
export async function insertGroupLink(env: Env, groupId: string, userId: string): Promise<{ id: string; token: string }> {
  const id = randomId();
  const token = randomId(18);
  await env.DB.prepare(
    `INSERT INTO invites (id, group_id, token, member_id, label, created_by, created_at, expires_at, multi_use)
     VALUES (?, ?, ?, NULL, '', ?, ?, ?, 1)`,
  )
    .bind(id, groupId, token, userId, now(), NEVER)
    .run();
  return { id, token };
}

export async function activeGroupLink(env: Env, groupId: string): Promise<string | null> {
  const row = await env.DB.prepare(
    `SELECT token FROM invites WHERE group_id = ? AND multi_use = 1 AND revoked_at IS NULL AND expires_at > ?
     ORDER BY created_at DESC LIMIT 1`,
  )
    .bind(groupId, now())
    .first<{ token: string }>();
  return row?.token ?? null;
}

/** Returns the group's share link, creating one if the group has none. Only the group owner (or an admin) can see it. */
export async function getOrCreateGroupLink(request: Request, env: Env, user: User, groupId: string): Promise<Response> {
  await requireGroupManager(env, groupId, user);
  const existing = await activeGroupLink(env, groupId);
  if (existing) return Response.json({ token: existing });
  const { id, token } = await insertGroupLink(env, groupId, user.id);
  await audit(env, request, user, "invite.created", { groupId, target: id, details: { type: "group link" } });
  return Response.json({ token }, { status: 201 });
}

/** Replaces the share link: the old link stops working. Only the group owner (or an admin) can do this. */
export async function resetGroupLink(request: Request, env: Env, user: User, groupId: string): Promise<Response> {
  await requireGroupManager(env, groupId, user);
  await env.DB.prepare("UPDATE invites SET revoked_at = ? WHERE group_id = ? AND multi_use = 1 AND revoked_at IS NULL")
    .bind(now(), groupId)
    .run();
  const { id, token } = await insertGroupLink(env, groupId, user.id);
  await audit(env, request, user, "invite.reset", { groupId, target: id });
  return Response.json({ token }, { status: 201 });
}

/** Cancels an unused personal (single-use) link from before group links existed. */
export async function revokeInvite(request: Request, env: Env, user: User, groupId: string, inviteId: string) {
  await requireGroupManager(env, groupId, user);
  const res = await env.DB.prepare(
    "UPDATE invites SET revoked_at = ? WHERE id = ? AND group_id = ? AND multi_use = 0 AND used_at IS NULL AND revoked_at IS NULL",
  )
    .bind(now(), inviteId, groupId)
    .run();
  if (!res.meta.changes) throw new HttpError(400, "This invite can no longer be cancelled");
  await audit(env, request, user, "invite.revoked", { groupId, target: inviteId });
  return new Response(null, { status: 204 });
}

type FullInvite = InviteRow & { multi_use: number; group_name: string; group_description: string; inviter: string | null };

async function inviteByToken(env: Env, token: string): Promise<FullInvite> {
  const invite = await env.DB.prepare(
    `SELECT i.*, g.name AS group_name, g.description AS group_description, u.name AS inviter
     FROM invites i JOIN groups g ON g.id = i.group_id LEFT JOIN users u ON u.id = i.created_by
     WHERE i.token = ?`,
  )
    .bind(token)
    .first<FullInvite>();
  if (!invite) throw new HttpError(404, "This link doesn't exist. Check the link or ask the group for it again.");
  return invite;
}

/** Public: shows which group the link is for, so a signed-out visitor knows what they're joining. */
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

  const open = (await members(env, invite.group_id)).filter((m) => !m.user_id);
  // Preselect the person this link was made for, or someone already listed under the user's name.
  const suggested =
    open.find((m) => m.id === invite.member_id) ?? open.find((m) => user.name && m.name.toLowerCase() === user.name.toLowerCase());
  return Response.json({
    ...base,
    alreadyMember: false,
    suggestedMemberId: suggested?.id ?? null,
    openPeople: open.map((m) => ({ id: m.id, name: m.name })),
  });
}

/** Joins the group. Body: { memberId } to join as someone already listed, or { name } to be added. */
export async function joinInvite(request: Request, env: Env, user: User, token: string): Promise<Response> {
  const invite = await inviteByToken(env, token);
  const mine = await env.DB.prepare("SELECT id FROM members WHERE group_id = ? AND user_id = ?").bind(invite.group_id, user.id).first();
  if (mine) return Response.json({ id: invite.group_id });

  const status = inviteStatus(invite);
  if (status !== "active") {
    throw new HttpError(410, "This link no longer works. Ask the group for the current link.");
  }

  const body = await readJson(request);
  const t = now();
  let release: (() => Promise<unknown>) | null = null;
  if (!invite.multi_use) {
    // Personal links work once; only one request can win this update.
    const claimed = await env.DB.prepare(
      "UPDATE invites SET used_at = ?, used_by = ? WHERE id = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?",
    )
      .bind(t, user.id, invite.id, t)
      .run();
    if (!claimed.meta.changes) throw new HttpError(410, "This link was just used. Ask the group for the current link.");
    release = () => env.DB.prepare("UPDATE invites SET used_at = NULL, used_by = NULL WHERE id = ?").bind(invite.id).run();
  }

  let memberId: string;
  try {
    if (typeof body.memberId === "string") {
      const res = await env.DB.prepare("UPDATE members SET user_id = ? WHERE id = ? AND group_id = ? AND user_id IS NULL")
        .bind(user.id, body.memberId, invite.group_id)
        .run();
      if (!res.meta.changes) throw new HttpError(409, "Someone else already joined as that person. Pick another name.");
      memberId = body.memberId;
    } else {
      memberId = await insertMember(env, invite.group_id, text(body.name ?? user.name, "Your name", { max: 60 }), user.id);
    }
  } catch (error) {
    await release?.();
    throw error;
  }

  await env.DB.batch([
    env.DB.prepare("UPDATE invites SET use_count = use_count + 1, last_used_at = ? WHERE id = ?").bind(t, invite.id),
    // A personal link for someone who has now joined is no longer needed.
    env.DB.prepare("UPDATE invites SET revoked_at = ? WHERE member_id = ? AND id != ? AND used_at IS NULL AND revoked_at IS NULL").bind(
      t,
      memberId,
      invite.id,
    ),
  ]);
  await audit(env, request, user, "invite.used", {
    groupId: invite.group_id,
    target: invite.id,
    details: { memberId, link: invite.multi_use ? "group" : "personal", joinedAs: typeof body.memberId === "string" ? "existing" : "new" },
  });
  return Response.json({ id: invite.group_id });
}
