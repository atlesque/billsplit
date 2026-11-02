// Payment reminders, run once a day by the cron trigger. In groups where the owner turned them on,
// anyone with an account who has owed money for over a week (and hasn't paid anything back or
// marked a payment as sent since) gets an email, at most once a week. See src/reminder-rules.ts.

import { now } from "./http";
import { sendReminderEmail } from "./notify";
import { dueReminders, type TimedMovement } from "./reminder-rules.ts";

export async function sendPaymentReminders(env: Env, at = now()): Promise<number> {
  // Staging has no email sending, so there is nothing to remind anyone with.
  if (env.STAGING === "true") return 0;
  const { results: groups } = await env.DB.prepare(
    "SELECT id FROM groups WHERE reminders_at IS NOT NULL AND archived_at IS NULL",
  ).all<{ id: string }>();
  let sent = 0;
  for (const { id: groupId } of groups) {
    try {
      sent += await remindGroup(env, groupId, at);
    } catch (error) {
      console.error("Payment reminders failed for group", groupId, error);
    }
  }
  if (sent) console.log(`Sent ${sent} payment reminders`);
  return sent;
}

async function remindGroup(env: Env, groupId: string, at: number): Promise<number> {
  const [members, expenses, shares, open] = await env.DB.batch([
    env.DB.prepare("SELECT id, name, user_id, reminded_at FROM members WHERE group_id = ?").bind(groupId),
    env.DB.prepare("SELECT id, kind, amount_cents, paid_by, created_at FROM expenses WHERE group_id = ?").bind(groupId),
    env.DB.prepare(
      "SELECT s.expense_id, s.member_id, s.amount_cents FROM expense_shares s JOIN expenses e ON e.id = s.expense_id WHERE e.group_id = ?",
    ).bind(groupId),
    env.DB.prepare("SELECT DISTINCT from_member FROM payments WHERE group_id = ? AND status IN ('sent', 'not_received')").bind(groupId),
  ]);
  const memberRows = members.results as { id: string; name: string; user_id: string | null; reminded_at: number | null }[];
  const sharesBy = new Map<string, { memberId: string; amount: number }[]>();
  for (const s of shares.results as { expense_id: string; member_id: string; amount_cents: number }[]) {
    const list = sharesBy.get(s.expense_id) ?? [];
    list.push({ memberId: s.member_id, amount: s.amount_cents });
    sharesBy.set(s.expense_id, list);
  }
  const movements: TimedMovement[] = (expenses.results as { id: string; kind: string; amount_cents: number; paid_by: string; created_at: number }[]).map(
    (e) => ({ kind: e.kind, at: e.created_at, paidBy: e.paid_by, amount: e.amount_cents, shares: sharesBy.get(e.id) ?? [] }),
  );
  const due = dueReminders(
    memberRows.map((m) => ({ id: m.id, userId: m.user_id, remindedAt: m.reminded_at })),
    movements,
    new Set((open.results as { from_member: string }[]).map((p) => p.from_member)),
    at,
  );
  const names = new Map(memberRows.map((m) => [m.id, m.name]));
  let sent = 0;
  for (const r of due) {
    const ok = await sendReminderEmail(env, r.userId, groupId, r.owed.map((s) => ({ to: names.get(s.to) ?? "", amountCents: s.amount })));
    // Only a reminder that went out counts; a failed one is tried again the next day.
    if (ok) {
      await env.DB.prepare("UPDATE members SET reminded_at = ? WHERE id = ?").bind(at, r.memberId).run();
      sent++;
    }
  }
  return sent;
}
