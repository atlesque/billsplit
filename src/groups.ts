import { attachmentsByExpense, deleteFiles } from "./attachments";
import { audit } from "./audit";
import { isAdmin, type User } from "./auth";
import { HttpError, now, optionalText, randomId, readJson, text } from "./http";
import { requestLang, tr } from "./i18n";
import { activeGroupLink, insertGroupLink } from "./invites";
import { listPayments } from "./payments";
import { balances, isSettled, settle } from "./split";

export type Group = {
  id: string;
  name: string;
  description: string;
  currency: string;
  created_by: string;
  created_at: number;
  archived_at: number | null;
  attachments_removed_at: number | null;
  /** Set while the group is locked: nobody new can join. */
  locked_at: number | null;
};
type MemberRow = {
  id: string;
  name: string;
  user_id: string | null;
  email: string | null;
  bank_name: string | null;
  bank_iban: string | null;
  bank_bic: string | null;
};

const CURRENCY_RE = /^[A-Z]{3}$/;
export const MAX_MEMBERS = 50;

function currency(value: unknown): string {
  const code = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!CURRENCY_RE.test(code)) throw new HttpError(400, "Currency must be a 3-letter code such as EUR");
  return code;
}

/** Loads a group the user belongs to, or 404s without revealing whether it exists. */
export async function groupForUser(env: Env, groupId: string, user: User): Promise<{ group: Group; meId: string }> {
  const row = await env.DB.prepare(
    `SELECT g.id, g.name, g.description, g.currency, g.created_by, g.created_at, g.locked_at, g.archived_at, g.attachments_removed_at, m.id AS me_id
     FROM groups g JOIN members m ON m.group_id = g.id AND m.user_id = ?
     WHERE g.id = ?`,
  )
    .bind(user.id, groupId)
    .first<Group & { me_id: string }>();
  if (!row) throw new HttpError(404, "Group not found");
  const { me_id, ...group } = row;
  return { group, meId: me_id };
}

/** Group settings and the share link belong to the group's owner (its creator); admins can manage them too. */
export function canManageGroup(env: Env, user: User, group: Group): boolean {
  return group.created_by === user.id || isAdmin(env, user);
}

/** Archived groups are read-only: refuses any change to one (archiving and leaving are handled separately). */
export async function assertNotArchived(env: Env, groupId: string): Promise<void> {
  const row = await env.DB.prepare("SELECT archived_at FROM groups WHERE id = ?").bind(groupId).first<{ archived_at: number | null }>();
  if (row?.archived_at) throw new HttpError(409, "This group is archived. Reopen it to make changes.");
}

export async function requireGroupManager(env: Env, groupId: string, user: User) {
  const found = await groupForUser(env, groupId, user);
  if (!canManageGroup(env, user, found.group)) throw new HttpError(403, "Only the group owner can do this");
  return found;
}

/**
 * Who may change or delete an expense: whoever added it, the group owner, or an admin.
 * Expenses whose creator no longer has an account fall back to the payer's account.
 */
export function canEditExpense(
  env: Env,
  user: User,
  group: Group,
  expense: { created_by: string | null; paid_by: string },
  accountOf: (memberId: string) => string | null | undefined,
): boolean {
  if (canManageGroup(env, user, group)) return true;
  const owner = expense.created_by ?? accountOf(expense.paid_by);
  return owner === user.id;
}

export async function members(env: Env, groupId: string): Promise<MemberRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT m.id, m.name, m.user_id, u.email, u.bank_name, u.bank_iban, u.bank_bic
     FROM members m LEFT JOIN users u ON u.id = m.user_id
     WHERE m.group_id = ? ORDER BY m.created_at, m.name`,
  )
    .bind(groupId)
    .all<MemberRow>();
  return results;
}

type ExpenseRow = {
  id: string;
  kind: string;
  title: string;
  amount_cents: number;
  paid_by: string;
  spent_on: string;
  category: string;
  split_mode: string;
  created_by: string | null;
  created_at: number;
  updated_at: number;
};
type ShareRow = { expense_id: string; member_id: string; weight: number; amount_cents: number };

async function expensesWithShares(env: Env, groupId: string) {
  const [expenses, shares] = await env.DB.batch([
    env.DB.prepare(
      `SELECT id, kind, title, amount_cents, paid_by, spent_on, category, split_mode, created_by, created_at, updated_at
       FROM expenses WHERE group_id = ? ORDER BY spent_on DESC, created_at DESC`,
    ).bind(groupId),
    env.DB.prepare(
      `SELECT s.expense_id, s.member_id, s.weight, s.amount_cents FROM expense_shares s
       JOIN expenses e ON e.id = s.expense_id WHERE e.group_id = ?`,
    ).bind(groupId),
  ]);
  const byExpense = new Map<string, ShareRow[]>();
  for (const s of shares.results as ShareRow[]) {
    const list = byExpense.get(s.expense_id) ?? [];
    list.push(s);
    byExpense.set(s.expense_id, list);
  }
  return (expenses.results as ExpenseRow[]).map((e) => ({
    id: e.id,
    kind: e.kind,
    title: e.title,
    amount: e.amount_cents,
    paidBy: e.paid_by,
    date: e.spent_on,
    category: e.category,
    splitMode: e.split_mode,
    createdBy: e.created_by,
    createdAt: e.created_at,
    updatedAt: e.updated_at,
    shares: (byExpense.get(e.id) ?? []).map((s) => ({ memberId: s.member_id, weight: s.weight, amount: s.amount_cents })),
  }));
}

export async function listGroups(env: Env, user: User): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT g.id, g.name, g.description, g.currency, g.created_at, g.archived_at, m.id AS me_id,
       (SELECT COUNT(*) FROM members WHERE group_id = g.id) AS member_count,
       COALESCE((SELECT SUM(amount_cents) FROM expenses WHERE group_id = g.id AND kind = 'expense'), 0) AS total,
       COALESCE((SELECT SUM(amount_cents) FROM expenses WHERE paid_by = m.id), 0)
         - COALESCE((SELECT SUM(amount_cents) FROM expense_shares WHERE member_id = m.id), 0) AS my_balance,
       COALESCE((SELECT MAX(updated_at) FROM expenses WHERE group_id = g.id), g.created_at) AS last_activity,
       (SELECT COUNT(*) FROM payments WHERE to_member = m.id AND status = 'sent') AS to_confirm
     FROM groups g JOIN members m ON m.group_id = g.id AND m.user_id = ?
     ORDER BY g.archived_at IS NOT NULL, last_activity DESC`,
  )
    .bind(user.id)
    .all();
  return Response.json(results);
}

export async function getGroup(env: Env, user: User, groupId: string): Promise<Response> {
  const { group, meId } = await groupForUser(env, groupId, user);
  const [memberRows, expenses, shareToken, payments, attachments] = await Promise.all([
    members(env, groupId),
    expensesWithShares(env, groupId),
    activeGroupLink(env, groupId),
    listPayments(env, groupId),
    attachmentsByExpense(env, groupId),
  ]);
  const accountOf = new Map(memberRows.map((m) => [m.id, m.user_id]));
  // Other people's email addresses are private; only admins see them.
  const seesEmails = isAdmin(env, user);
  const archived = Boolean(group.archived_at);
  const canManage = canManageGroup(env, user, group);
  const balanceMap = balances(
    memberRows.map((m) => m.id),
    expenses.map((e) => ({ paidBy: e.paidBy, amount: e.amount, shares: e.shares })),
  );
  return Response.json({
    // Only the owner (and admins) see the share link.
    group: {
      ...group,
      locked: Boolean(group.locked_at),
      isOwner: group.created_by === user.id,
      canManage,
      shareToken: canManage && !archived ? shareToken : null,
      settled: isSettled(balanceMap, payments),
    },
    meId,
    members: memberRows.map((m) => ({
      id: m.id,
      name: m.name,
      claimed: Boolean(m.user_id),
      isMe: m.id === meId,
      isOwner: m.user_id === group.created_by,
      email: seesEmails || m.user_id === user.id ? m.email : null,
      // Bank details are shared with the people in your groups, so they can pay you back.
      bank: m.user_id && m.bank_iban ? { name: m.bank_name, iban: m.bank_iban, bic: m.bank_bic } : null,
      balance: balanceMap.get(m.id) ?? 0,
      paid: expenses.filter((e) => e.kind === "expense" && e.paidBy === m.id).reduce((a, e) => a + e.amount, 0),
      spent: expenses
        .filter((e) => e.kind === "expense")
        .reduce((a, e) => a + (e.shares.find((s) => s.memberId === m.id)?.amount ?? 0), 0),
    })),
    expenses: expenses.map(({ createdBy, ...e }) => ({
      ...e,
      attachments: attachments.get(e.id) ?? [],
      canEdit: !archived && canEditExpense(env, user, group, { created_by: createdBy, paid_by: e.paidBy }, (id) => accountOf.get(id)),
    })),
    settlements: settle(balanceMap),
    payments: payments.map((p) => ({
      id: p.id,
      from: p.from_member,
      to: p.to_member,
      amount: p.amount_cents,
      status: p.status,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
      canConfirm: !archived && accountOf.get(p.to_member) === user.id,
      canCancel: !archived && p.status !== "received" && (accountOf.get(p.from_member) === user.id || p.created_by === user.id),
    })),
  });
}

export async function createGroup(request: Request, env: Env, user: User): Promise<Response> {
  const body = await readJson(request);
  const name = text(body.name, "Group name", { max: 80 });
  const description = optionalText(body.description, "Description", 300);
  const cur = currency(body.currency ?? "EUR");
  const myName = text(body.myName ?? user.name, "Your name", { max: 60 });
  const others = Array.isArray(body.members) ? body.members.map((n) => text(n, "Name", { max: 60 })) : [];
  const names = new Set([myName.toLowerCase()]);
  for (const n of others) {
    if (names.has(n.toLowerCase())) throw new HttpError(400, '"{name}" is listed twice', { name: n });
    names.add(n.toLowerCase());
  }
  if (others.length >= MAX_MEMBERS) throw new HttpError(400, "A group can have at most {max} people", { max: MAX_MEMBERS });

  const id = randomId();
  const t = now();
  await env.DB.batch([
    // invite_token is a legacy column (invites now live in their own table) but is still NOT NULL UNIQUE.
    env.DB.prepare(
      "INSERT INTO groups (id, name, description, currency, invite_token, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).bind(id, name, description, cur, randomId(18), user.id, t),
    env.DB.prepare("INSERT INTO members (id, group_id, name, user_id, created_at) VALUES (?, ?, ?, ?, ?)").bind(
      randomId(),
      id,
      myName,
      user.id,
      t,
    ),
    ...others.map((n, i) =>
      env.DB.prepare("INSERT INTO members (id, group_id, name, user_id, created_at) VALUES (?, ?, ?, NULL, ?)").bind(
        randomId(),
        id,
        n,
        t + i + 1,
      ),
    ),
  ]);
  if (!user.name) await env.DB.prepare("UPDATE users SET name = ? WHERE id = ?").bind(myName, user.id).run();
  const link = await insertGroupLink(env, id, user.id);
  await audit(env, request, user, "group.created", { groupId: id, target: id, details: { name, currency: cur, people: [myName, ...others] } });
  return Response.json({ id, shareToken: link.token }, { status: 201 });
}

export async function updateGroup(request: Request, env: Env, user: User, groupId: string): Promise<Response> {
  const { group } = await requireGroupManager(env, groupId, user);
  const body = await readJson(request);
  const name = body.name === undefined ? group.name : text(body.name, "Group name", { max: 80 });
  const description = body.description === undefined ? group.description : optionalText(body.description, "Description", 300);
  const cur = body.currency === undefined ? group.currency : currency(body.currency);
  await env.DB.prepare("UPDATE groups SET name = ?, description = ?, currency = ? WHERE id = ?")
    .bind(name, description, cur, groupId)
    .run();
  const changes: Record<string, unknown> = {};
  if (name !== group.name) changes.name = { from: group.name, to: name };
  if (description !== group.description) changes.description = { from: group.description, to: description };
  if (cur !== group.currency) changes.currency = { from: group.currency, to: cur };
  if (Object.keys(changes).length) await audit(env, request, user, "group.updated", { groupId, target: groupId, details: changes });
  return Response.json({ ok: true });
}

/** Locks or unlocks the group. While locked, nobody new can join; people already in it are unaffected. */
export async function setGroupLocked(request: Request, env: Env, user: User, groupId: string, locked: boolean): Promise<Response> {
  const { group } = await requireGroupManager(env, groupId, user);
  if (Boolean(group.locked_at) !== locked) {
    await env.DB.prepare("UPDATE groups SET locked_at = ? WHERE id = ?").bind(locked ? now() : null, groupId).run();
    await audit(env, request, user, locked ? "group.locked" : "group.unlocked", { groupId, target: groupId });
  }
  return Response.json({ locked });
}

export async function deleteGroup(request: Request, env: Env, user: User, groupId: string): Promise<Response> {
  const { group } = await groupForUser(env, groupId, user);
  if (!canManageGroup(env, user, group)) throw new HttpError(403, "Only the group owner or an admin can delete it");
  const { results: files } = await env.DB.prepare("SELECT key FROM attachments WHERE group_id = ?").bind(groupId).all<{ key: string }>();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM attachments WHERE group_id = ?").bind(groupId),
    env.DB.prepare("DELETE FROM payments WHERE group_id = ?").bind(groupId),
    env.DB.prepare("DELETE FROM expense_shares WHERE expense_id IN (SELECT id FROM expenses WHERE group_id = ?)").bind(groupId),
    env.DB.prepare("DELETE FROM expenses WHERE group_id = ?").bind(groupId),
    env.DB.prepare("DELETE FROM invites WHERE group_id = ?").bind(groupId),
    env.DB.prepare("DELETE FROM members WHERE group_id = ?").bind(groupId),
    env.DB.prepare("DELETE FROM groups WHERE id = ?").bind(groupId),
  ]);
  await deleteFiles(env, files.map((f) => f.key));
  await audit(env, request, user, "group.deleted", { groupId, target: groupId, details: { name: group.name } });
  return new Response(null, { status: 204 });
}

/** Archives a settled group (owner or admin). It stays readable, with all its expenses, but can't be changed. */
export async function archiveGroup(request: Request, env: Env, user: User, groupId: string): Promise<Response> {
  const { group } = await requireGroupManager(env, groupId, user);
  if (group.archived_at) return Response.json({ ok: true });
  const [memberRows, expenses, payments] = await Promise.all([members(env, groupId), expensesWithShares(env, groupId), listPayments(env, groupId)]);
  const balanceMap = balances(
    memberRows.map((m) => m.id),
    expenses.map((e) => ({ paidBy: e.paidBy, amount: e.amount, shares: e.shares })),
  );
  if (!isSettled(balanceMap, payments)) throw new HttpError(400, "Everyone has to be settled up before the group can be archived");
  await env.DB.prepare("UPDATE groups SET archived_at = ?, archived_by = ? WHERE id = ? AND archived_at IS NULL").bind(now(), user.id, groupId).run();
  await audit(env, request, user, "group.archived", { groupId, target: groupId, details: { name: group.name } });
  return Response.json({ ok: true });
}

/** Takes a group out of the archive so it can be changed again (owner or admin). */
export async function reopenGroup(request: Request, env: Env, user: User, groupId: string): Promise<Response> {
  const { group } = await requireGroupManager(env, groupId, user);
  if (!group.archived_at) return Response.json({ ok: true });
  await env.DB.prepare("UPDATE groups SET archived_at = NULL, archived_by = NULL WHERE id = ?").bind(groupId).run();
  await audit(env, request, user, "group.reopened", { groupId, target: groupId, details: { name: group.name } });
  return Response.json({ ok: true });
}

export async function leaveGroup(request: Request, env: Env, user: User, groupId: string): Promise<Response> {
  const { meId } = await groupForUser(env, groupId, user);
  // The participant (and their expenses) stays; only the link to this account is removed.
  await env.DB.prepare("UPDATE members SET user_id = NULL WHERE id = ?").bind(meId).run();
  await audit(env, request, user, "member.left", { groupId, target: meId });
  return new Response(null, { status: 204 });
}

async function assertUniqueName(env: Env, groupId: string, name: string, exceptId?: string) {
  const clash = await env.DB.prepare(
    "SELECT id FROM members WHERE group_id = ? AND lower(name) = lower(?) AND id != ?",
  )
    .bind(groupId, name, exceptId ?? "")
    .first();
  if (clash) throw new HttpError(400, 'There is already someone called "{name}" in this group', { name });
}

/** Inserts a participant; used by "add person" and by joining through an open invite. */
export async function insertMember(env: Env, groupId: string, name: string, userId: string | null): Promise<string> {
  await assertUniqueName(env, groupId, name);
  const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM members WHERE group_id = ?").bind(groupId).first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_MEMBERS) throw new HttpError(400, "A group can have at most {max} people", { max: MAX_MEMBERS });
  const id = randomId();
  await env.DB.prepare("INSERT INTO members (id, group_id, name, user_id, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(id, groupId, name, userId, now())
    .run();
  return id;
}

export async function addMember(request: Request, env: Env, user: User, groupId: string): Promise<Response> {
  await groupForUser(env, groupId, user);
  const name = text((await readJson(request)).name, "Name", { max: 60 });
  const id = await insertMember(env, groupId, name, null);
  await audit(env, request, user, "member.added", { groupId, target: id, details: { name } });
  return Response.json({ id }, { status: 201 });
}

export async function renameMember(request: Request, env: Env, user: User, groupId: string, memberId: string) {
  await groupForUser(env, groupId, user);
  const name = text((await readJson(request)).name, "Name", { max: 60 });
  await assertUniqueName(env, groupId, name, memberId);
  const before = await env.DB.prepare("SELECT name FROM members WHERE id = ? AND group_id = ?").bind(memberId, groupId).first<{ name: string }>();
  if (!before) throw new HttpError(404, "Person not found");
  await env.DB.prepare("UPDATE members SET name = ? WHERE id = ?").bind(name, memberId).run();
  await audit(env, request, user, "member.renamed", { groupId, target: memberId, details: { from: before.name, to: name } });
  return Response.json({ ok: true });
}

export async function removeMember(request: Request, env: Env, user: User, groupId: string, memberId: string) {
  const { meId } = await groupForUser(env, groupId, user);
  if (memberId === meId) throw new HttpError(400, "Use “Leave group” to remove yourself");
  const member = await env.DB.prepare("SELECT name, user_id FROM members WHERE id = ? AND group_id = ?")
    .bind(memberId, groupId)
    .first<{ name: string; user_id: string | null }>();
  if (!member) throw new HttpError(404, "Person not found");
  const used = await env.DB.prepare(
    `SELECT 1 FROM expenses WHERE paid_by = ?1 UNION SELECT 1 FROM expense_shares WHERE member_id = ?1 LIMIT 1`,
  )
    .bind(memberId)
    .first();
  if (used) throw new HttpError(400, "{name} is in some expenses. Remove them from those expenses first.", { name: member.name });
  await env.DB.batch([
    env.DB.prepare("UPDATE invites SET revoked_at = ? WHERE member_id = ? AND used_at IS NULL AND revoked_at IS NULL").bind(now(), memberId),
    env.DB.prepare("UPDATE invites SET member_id = NULL WHERE member_id = ?").bind(memberId),
    // Payments they were part of that never completed (completed ones are expenses, checked above).
    env.DB.prepare("DELETE FROM payments WHERE from_member = ?1 OR to_member = ?1").bind(memberId),
    env.DB.prepare("DELETE FROM members WHERE id = ?").bind(memberId),
  ]);
  await audit(env, request, user, "member.removed", { groupId, target: memberId, details: { name: member.name, hadAccount: Boolean(member.user_id) } });
  return new Response(null, { status: 204 });
}

export async function exportCsv(request: Request, env: Env, user: User, groupId: string): Promise<Response> {
  const lang = requestLang(request);
  const { group } = await groupForUser(env, groupId, user);
  const [memberRows, expenses] = await Promise.all([members(env, groupId), expensesWithShares(env, groupId)]);
  const names = new Map(memberRows.map((m) => [m.id, m.name]));
  const cell = (v: string | number) => {
    const s = String(v);
    return /[",\n]|^[=+\-@]/.test(s) ? `"${s.replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"` : s;
  };
  const fmt = (c: number) => (c / 100).toFixed(2);
  const header = [
    ...["Date", "Title", "Type", "Category"].map((h) => tr(lang, h)),
    tr(lang, "Amount ({currency})", { currency: group.currency }),
    tr(lang, "Paid by"),
    ...memberRows.map((m) => m.name),
  ];
  const lines = [header.map(cell).join(",")];
  for (const e of [...expenses].reverse()) {
    lines.push(
      [
        e.date,
        e.kind === "transfer" && e.title === "Payment" ? tr(lang, e.title) : e.title,
        tr(lang, e.kind),
        e.category && tr(lang, e.category),
        fmt(e.amount),
        names.get(e.paidBy) ?? "",
        ...memberRows.map((m) => fmt(e.shares.find((s) => s.memberId === m.id)?.amount ?? 0)),
      ]
        .map(cell)
        .join(","),
    );
  }
  const filename = group.name.replace(/[^\w\- ]+/g, "").trim() || "billsplit";
  return new Response(lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}.csv"`,
    },
  });
}
