// Settle-up payments that both sides confirm. The sender marks a payment as sent; the recipient
// then marks it received, not received yet, or failed. Only a received payment counts: it is
// recorded as a 'transfer' expense at that moment, so balances, the expense list and the export
// all pick it up without special cases.

import { audit } from "./audit";
import type { User } from "./auth";
import { groupForUser } from "./groups";
import { cents, HttpError, now, randomId, readJson } from "./http";
import { sendPaymentEmail } from "./notify";

/** Hands background work (emails) to the runtime so the response doesn't wait for it. */
export type Defer = (promise: Promise<unknown>) => void;

export type PaymentStatus = "sent" | "not_received" | "failed" | "received";
const OPEN = "('sent', 'not_received')";
const FAILED_SHOWN_FOR = 30 * 24 * 3600 * 1000;

type PaymentRow = {
  id: string;
  from_member: string;
  to_member: string;
  amount_cents: number;
  status: PaymentStatus;
  created_by: string | null;
  created_at: number;
  updated_at: number;
};

/** Payments still in progress, plus recently failed ones, for the group page. */
export async function listPayments(env: Env, groupId: string): Promise<PaymentRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, from_member, to_member, amount_cents, status, created_by, created_at, updated_at FROM payments
     WHERE group_id = ? AND (status IN ${OPEN} OR (status = 'failed' AND updated_at > ?))
     ORDER BY created_at DESC`,
  )
    .bind(groupId, now() - FAILED_SHOWN_FOR)
    .all<PaymentRow>();
  return results;
}

async function memberAccounts(env: Env, groupId: string) {
  const { results } = await env.DB.prepare("SELECT id, name, user_id FROM members WHERE group_id = ?")
    .bind(groupId)
    .all<{ id: string; name: string; user_id: string | null }>();
  return new Map(results.map((m) => [m.id, m]));
}

/**
 * Statements that record a payment as a transfer expense and close it, but only while it is still
 * open. They run in one batch (a transaction), so confirming twice never records the money twice.
 */
function recordStatements(env: Env, groupId: string, p: { id: string; from: string; to: string; amount: number }, user: User) {
  const expenseId = randomId();
  const t = now();
  const stillOpen = `EXISTS (SELECT 1 FROM payments WHERE id = ? AND status IN ${OPEN})`;
  return [
    env.DB.prepare(
      `INSERT INTO expenses (id, group_id, kind, title, amount_cents, paid_by, spent_on, category, split_mode, created_by, created_at, updated_at)
       SELECT ?, ?, 'transfer', 'Payment', ?, ?, ?, '', 'equal', ?, ?, ? WHERE ${stillOpen}`,
    ).bind(expenseId, groupId, p.amount, p.from, new Date(t).toISOString().slice(0, 10), user.id, t, t, p.id),
    env.DB.prepare(
      `INSERT INTO expense_shares (expense_id, member_id, weight, amount_cents) SELECT ?, ?, 1, ? WHERE ${stillOpen}`,
    ).bind(expenseId, p.to, p.amount, p.id),
    env.DB.prepare(
      `UPDATE payments SET status = 'received', expense_id = ?, confirmed_by = ?, confirmed_at = ?, updated_at = ?
       WHERE id = ? AND status IN ${OPEN}`,
    ).bind(expenseId, user.id, t, t, p.id),
  ];
}

export async function createPayment(request: Request, env: Env, user: User, groupId: string, defer: Defer): Promise<Response> {
  const { meId } = await groupForUser(env, groupId, user);
  const body = await readJson(request);
  const amount = cents(body.amount, "Amount");
  const accounts = await memberAccounts(env, groupId);
  const from = accounts.get(String(body.from));
  const to = accounts.get(String(body.to));
  if (!from || !to) throw new HttpError(400, "Unknown participant in payment");
  if (from.id === to.id) throw new HttpError(400, "A payment goes from one person to one other person");
  // You mark your own payments, confirm ones made to you, or record them for someone without an account.
  if (from.id !== meId && to.id !== meId && from.user_id) {
    throw new HttpError(403, "Only {name} can mark this payment as sent", { name: from.name });
  }
  const open = await env.DB.prepare(`SELECT 1 FROM payments WHERE from_member = ? AND to_member = ? AND status IN ${OPEN}`)
    .bind(from.id, to.id)
    .first();
  if (open) throw new HttpError(400, "A payment from {from} to {to} is already waiting to be confirmed", { from: from.name, to: to.name });

  const id = randomId();
  const t = now();
  // The recipient confirms, unless they are the one recording it or have no account to confirm with.
  const confirmed = to.id === meId || !to.user_id;
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO payments (id, group_id, from_member, to_member, amount_cents, status, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'sent', ?, ?, ?)`,
    ).bind(id, groupId, from.id, to.id, amount, user.id, t, t),
    ...(confirmed ? recordStatements(env, groupId, { id, from: from.id, to: to.id, amount }, user) : []),
  ]);
  await audit(env, request, user, confirmed ? "payment.recorded" : "payment.sent", {
    groupId,
    target: id,
    details: { from: from.name, to: to.name, amount },
  });
  // Tell the other side: the recipient that money is on its way, or the payer that it arrived.
  const notify = confirmed ? from : to;
  if (notify.user_id && notify.user_id !== user.id) {
    const kind = confirmed ? "payment_received" : "payment_sent";
    defer(sendPaymentEmail(env, { kind, userId: notify.user_id, groupId, from: from.name, to: to.name, amountCents: amount }));
  }
  return Response.json({ id, status: confirmed ? "received" : "sent" }, { status: 201 });
}

async function loadPayment(env: Env, groupId: string, paymentId: string) {
  const payment = await env.DB.prepare(
    `SELECT p.id, p.from_member, p.to_member, p.amount_cents, p.status, p.created_by, f.name AS from_name, f.user_id AS from_user,
       r.name AS to_name, r.user_id AS to_user
     FROM payments p JOIN members f ON f.id = p.from_member JOIN members r ON r.id = p.to_member
     WHERE p.id = ? AND p.group_id = ?`,
  )
    .bind(paymentId, groupId)
    .first<PaymentRow & { from_name: string; from_user: string | null; to_name: string; to_user: string | null }>();
  if (!payment) throw new HttpError(404, "Payment not found");
  return payment;
}

const ANSWERS: PaymentStatus[] = ["received", "not_received", "failed"];

/** The recipient's answer: received (done), not received (still in progress) or failed (closed). */
export async function confirmPayment(request: Request, env: Env, user: User, groupId: string, paymentId: string, defer: Defer) {
  await groupForUser(env, groupId, user);
  const status = (await readJson(request)).status as PaymentStatus;
  if (!ANSWERS.includes(status)) throw new HttpError(400, "Unknown payment status");
  const p = await loadPayment(env, groupId, paymentId);
  if (p.to_user !== user.id) throw new HttpError(403, "Only {name} can confirm this payment", { name: p.to_name });
  if (p.status !== "sent" && p.status !== "not_received") throw new HttpError(400, "This payment is already closed");

  if (status === "received") {
    const results = await env.DB.batch(recordStatements(env, groupId, { id: p.id, from: p.from_member, to: p.to_member, amount: p.amount_cents }, user));
    if (!results[2].meta.changes) throw new HttpError(400, "This payment is already closed");
  } else {
    await env.DB.prepare(`UPDATE payments SET status = ?, updated_at = ? WHERE id = ? AND status IN ${OPEN}`)
      .bind(status, now(), p.id)
      .run();
  }
  await audit(env, request, user, `payment.${status}`, {
    groupId,
    target: p.id,
    details: { from: p.from_name, to: p.to_name, amount: p.amount_cents },
  });
  if (status === "received" && p.from_user && p.from_user !== user.id) {
    defer(
      sendPaymentEmail(env, { kind: "payment_received", userId: p.from_user, groupId, from: p.from_name, to: p.to_name, amountCents: p.amount_cents }),
    );
  }
  return Response.json({ id: p.id, status });
}

/** The sender (or whoever recorded it) withdraws a payment that hasn't been received. */
export async function cancelPayment(request: Request, env: Env, user: User, groupId: string, paymentId: string) {
  await groupForUser(env, groupId, user);
  const p = await loadPayment(env, groupId, paymentId);
  if (p.from_user !== user.id && p.created_by !== user.id) throw new HttpError(403, "Only {name} can cancel this payment", { name: p.from_name });
  if (p.status === "received") throw new HttpError(400, "This payment is already closed");
  await env.DB.prepare("DELETE FROM payments WHERE id = ? AND status != 'received'").bind(p.id).run();
  await audit(env, request, user, "payment.cancelled", {
    groupId,
    target: p.id,
    details: { from: p.from_name, to: p.to_name, amount: p.amount_cents, status: p.status },
  });
  return new Response(null, { status: 204 });
}
