import { audit } from "./audit";
import type { User } from "./auth";
import { canEditExpense, groupForUser } from "./groups";
import { cents, HttpError, now, optionalText, randomId, readJson, text } from "./http";
import { resolveShares, type SplitMode } from "./split";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MODES: SplitMode[] = ["equal", "shares", "amounts"];

/** Loads an expense and refuses unless this user may change it (see canEditExpense). */
async function editableExpense(env: Env, user: User, groupId: string, expenseId: string) {
  const { group } = await groupForUser(env, groupId, user);
  const row = await env.DB.prepare(
    `SELECT e.title, e.amount_cents, e.kind, e.paid_by, e.created_by, m.user_id AS payer_account
     FROM expenses e JOIN members m ON m.id = e.paid_by WHERE e.id = ? AND e.group_id = ?`,
  )
    .bind(expenseId, groupId)
    .first<{ title: string; amount_cents: number; kind: string; paid_by: string; created_by: string | null; payer_account: string | null }>();
  if (!row) throw new HttpError(404, "Expense not found");
  if (!canEditExpense(env, user, group, row, () => row.payer_account)) {
    throw new HttpError(403, "Only the person who added this, the group owner or an admin can change it");
  }
  return row;
}

async function parseExpense(request: Request, env: Env, groupId: string) {
  const body = await readJson(request);
  const kind = body.kind === "transfer" ? "transfer" : "expense";
  const title = kind === "transfer" && !body.title ? "Payment" : text(body.title, "Title", { max: 100 });
  const amount = cents(body.amount, "Amount");
  const date = typeof body.date === "string" && DATE_RE.test(body.date) ? body.date : new Date().toISOString().slice(0, 10);
  const category = optionalText(body.category, "Category", 40);
  const mode = (MODES.includes(body.splitMode as SplitMode) ? body.splitMode : "equal") as SplitMode;
  if (typeof body.paidBy !== "string") throw new HttpError(400, "Choose who paid");
  if (!Array.isArray(body.shares)) throw new HttpError(400, "Choose who to split with");

  const { results } = await env.DB.prepare("SELECT id FROM members WHERE group_id = ?").bind(groupId).all<{ id: string }>();
  const memberIds = new Set(results.map((r) => r.id));
  if (!memberIds.has(body.paidBy)) throw new HttpError(400, "The payer is not in this group");

  const weights = new Map<string, number>();
  for (const s of body.shares as { memberId?: unknown; weight?: unknown }[]) {
    if (typeof s?.memberId !== "string" || !memberIds.has(s.memberId)) throw new HttpError(400, "Unknown participant in split");
    const w = mode === "equal" ? 1 : s.weight;
    if (typeof w !== "number" || !Number.isSafeInteger(w) || w < 0) throw new HttpError(400, "Split values must be whole, non-negative numbers");
    if (w > 0) weights.set(s.memberId, w);
  }
  if (kind === "transfer" && (weights.size !== 1 || weights.has(body.paidBy))) {
    throw new HttpError(400, "A payment goes from one person to one other person");
  }
  let resolved: Map<string, number>;
  try {
    resolved = resolveShares(amount, kind === "transfer" ? "equal" : mode, weights);
  } catch (error) {
    throw new HttpError(400, (error as Error).message);
  }
  return { kind, title, amount, date, category, mode: kind === "transfer" ? "equal" : mode, paidBy: body.paidBy, weights, resolved };
}

type Parsed = Awaited<ReturnType<typeof parseExpense>>;

const summary = (p: Parsed) => ({ kind: p.kind, title: p.title, amount: p.amount, paidBy: p.paidBy, split: p.mode, people: p.resolved.size });

function shareInserts(env: Env, expenseId: string, p: Parsed) {
  return [...p.resolved].map(([memberId, amount]) =>
    env.DB.prepare("INSERT INTO expense_shares (expense_id, member_id, weight, amount_cents) VALUES (?, ?, ?, ?)").bind(
      expenseId,
      memberId,
      p.weights.get(memberId) ?? 1,
      amount,
    ),
  );
}

export async function createExpense(request: Request, env: Env, user: User, groupId: string): Promise<Response> {
  await groupForUser(env, groupId, user);
  const p = await parseExpense(request, env, groupId);
  const id = randomId();
  const t = now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO expenses (id, group_id, kind, title, amount_cents, paid_by, spent_on, category, split_mode, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, groupId, p.kind, p.title, p.amount, p.paidBy, p.date, p.category, p.mode, user.id, t, t),
    ...shareInserts(env, id, p),
  ]);
  await audit(env, request, user, "expense.created", { groupId, target: id, details: summary(p) });
  return Response.json({ id }, { status: 201 });
}

export async function updateExpense(request: Request, env: Env, user: User, groupId: string, expenseId: string) {
  const before = await editableExpense(env, user, groupId, expenseId);
  const p = await parseExpense(request, env, groupId);
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE expenses SET kind = ?, title = ?, amount_cents = ?, paid_by = ?, spent_on = ?, category = ?, split_mode = ?, updated_at = ?
       WHERE id = ?`,
    ).bind(p.kind, p.title, p.amount, p.paidBy, p.date, p.category, p.mode, now(), expenseId),
    env.DB.prepare("DELETE FROM expense_shares WHERE expense_id = ?").bind(expenseId),
    ...shareInserts(env, expenseId, p),
  ]);
  await audit(env, request, user, "expense.updated", {
    groupId,
    target: expenseId,
    details: { ...summary(p), before: { title: before.title, amount: before.amount_cents } },
  });
  return Response.json({ id: expenseId });
}

export async function deleteExpense(request: Request, env: Env, user: User, groupId: string, expenseId: string) {
  const before = await editableExpense(env, user, groupId, expenseId);
  const res = await env.DB.batch([
    // A confirmed settle-up payment is this expense, so deleting it removes the payment too.
    env.DB.prepare("DELETE FROM payments WHERE expense_id IN (SELECT id FROM expenses WHERE id = ? AND group_id = ?)").bind(expenseId, groupId),
    env.DB.prepare("DELETE FROM expense_shares WHERE expense_id IN (SELECT id FROM expenses WHERE id = ? AND group_id = ?)").bind(expenseId, groupId),
    env.DB.prepare("DELETE FROM expenses WHERE id = ? AND group_id = ?").bind(expenseId, groupId),
  ]);
  if (!res[2].meta.changes) throw new HttpError(404, "Expense not found");
  await audit(env, request, user, "expense.deleted", { groupId, target: expenseId, details: { kind: before.kind, title: before.title, amount: before.amount_cents } });
  return new Response(null, { status: 204 });
}
