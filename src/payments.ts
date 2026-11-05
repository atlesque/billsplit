// Settle-up payments that both sides confirm. The sender marks a payment as sent; the recipient
// then marks it received, not received yet, or failed. Only a received payment counts: it is
// recorded as a 'transfer' expense at that moment, so balances, the expense list and the export
// all pick it up without special cases.

import { audit } from "./audit";
import type { User } from "./auth";
import { groupForUser } from "./groups";
import { cents, HttpError, now, randomId, readJson, sha256 } from "./http";
import { sendPaymentEmail } from "./notify";
import { CONFIRM_LINK_DAYS } from "./payment-email";
import { paymentLinkState } from "./payment-link";

/** Hands background work (emails) to the runtime so the response doesn't wait for it. */
export type Defer = (promise: Promise<unknown>) => void;

export type PaymentStatus = "sent" | "not_received" | "failed" | "received";
const OPEN = "('sent', 'not_received')";
const FAILED_SHOWN_FOR = 30 * 24 * 3600 * 1000;
const CONFIRM_LINK_TTL = CONFIRM_LINK_DAYS * 24 * 3600 * 1000;

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
  // The recipient's email links to a page for confirming just this payment (see paymentLinkView).
  const linkToken = confirmed ? null : randomId(18);
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO payments (id, group_id, from_member, to_member, amount_cents, status, created_by, created_at, updated_at, confirm_token_hash, confirm_expires_at)
       VALUES (?, ?, ?, ?, ?, 'sent', ?, ?, ?, ?, ?)`,
    ).bind(id, groupId, from.id, to.id, amount, user.id, t, t, linkToken && (await sha256(linkToken)), linkToken && t + CONFIRM_LINK_TTL),
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
    const path = linkToken ? `/confirm-payment/${linkToken}` : undefined;
    defer(sendPaymentEmail(env, { kind, userId: notify.user_id, groupId, from: from.name, to: to.name, amountCents: amount, path }));
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
    await markReceived(request, env, user, groupId, p, defer);
  } else {
    await env.DB.prepare(`UPDATE payments SET status = ?, updated_at = ? WHERE id = ? AND status IN ${OPEN}`)
      .bind(status, now(), p.id)
      .run();
    await audit(env, request, user, `payment.${status}`, {
      groupId,
      target: p.id,
      details: { from: p.from_name, to: p.to_name, amount: p.amount_cents },
    });
  }
  return Response.json({ id: p.id, status });
}

type OpenPayment = { id: string; from_member: string; to_member: string; amount_cents: number; from_name: string; from_user: string | null; to_name: string };

/** The recipient confirms an open payment: it is recorded, and the payer hears that it arrived. */
async function markReceived(request: Request, env: Env, user: User, groupId: string, p: OpenPayment, defer: Defer, via?: string) {
  const results = await env.DB.batch(recordStatements(env, groupId, { id: p.id, from: p.from_member, to: p.to_member, amount: p.amount_cents }, user));
  if (!results[2].meta.changes) throw new HttpError(400, "This payment is already closed");
  await audit(env, request, user, "payment.received", {
    groupId,
    target: p.id,
    details: { from: p.from_name, to: p.to_name, amount: p.amount_cents, ...(via && { via }) },
  });
  if (p.from_user && p.from_user !== user.id) {
    defer(
      sendPaymentEmail(env, { kind: "payment_received", userId: p.from_user, groupId, from: p.from_name, to: p.to_name, amountCents: p.amount_cents }),
    );
  }
}

// The confirm link from the "payment sent" email (/confirm-payment/:token). It works only for the
// one payment it was made for, only for the account that payment went to, and only for
// CONFIRM_LINK_TTL. The page shows the payment and confirms it with a button, never on load, so
// email link scanners can't confirm anything.

type LinkRow = OpenPayment & {
  group_id: string;
  group_name: string;
  currency: string;
  status: PaymentStatus;
  to_user: string | null;
  created_at: number;
  confirmed_at: number | null;
  confirm_expires_at: number;
};

async function loadLink(env: Env, token: string): Promise<LinkRow | null> {
  return env.DB.prepare(
    `SELECT p.id, p.group_id, p.from_member, p.to_member, p.amount_cents, p.status, p.created_at, p.confirmed_at, p.confirm_expires_at,
       g.name AS group_name, g.currency, f.name AS from_name, f.user_id AS from_user, r.name AS to_name, r.user_id AS to_user
     FROM payments p JOIN groups g ON g.id = p.group_id JOIN members f ON f.id = p.from_member JOIN members r ON r.id = p.to_member
     WHERE p.confirm_token_hash = ?`,
  )
    .bind(await sha256(token))
    .first<LinkRow>();
}

function linkView(p: LinkRow | null, user: User) {
  const state = paymentLinkState(p, user.id, now());
  if (!p || state === "wrong_account") return { state, linkDays: CONFIRM_LINK_DAYS };
  return {
    state,
    linkDays: CONFIRM_LINK_DAYS,
    payment: {
      groupId: p.group_id,
      groupName: p.group_name,
      currency: p.currency,
      from: p.from_name,
      to: p.to_name,
      amount: p.amount_cents,
      status: p.status,
      sentAt: p.created_at,
      confirmedAt: p.confirmed_at,
      expiresAt: p.confirm_expires_at,
    },
  };
}

export async function getPaymentLink(env: Env, user: User, token: string): Promise<Response> {
  return Response.json(linkView(await loadLink(env, token), user));
}

/** The Confirm button on the link's page. Answers with the page's new state. */
export async function confirmPaymentLink(request: Request, env: Env, user: User, token: string, defer: Defer): Promise<Response> {
  const p = await loadLink(env, token);
  const state = paymentLinkState(p, user.id, now());
  if (state === "wrong_account") throw new HttpError(403, "This link is for someone else's account");
  if (state === "expired") throw new HttpError(410, "This link has expired. Confirm the payment in the group instead.");
  if (state !== "open") throw new HttpError(400, "This payment is already closed");
  await markReceived(request, env, user, p!.group_id, p!, defer, "email link");
  return Response.json(linkView(await loadLink(env, token), user));
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
