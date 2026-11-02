// Who gets a payment reminder, as pure logic so it can be unit tested in plain Node (src/reminders.ts
// loads the data and sends the emails). All times are milliseconds since the epoch.

import { balances, settle, type Movement, type Settlement } from "./split.ts";

export const WEEK = 7 * 24 * 3600 * 1000;
// The daily run doesn't start at the exact same millisecond every day; without some slack a weekly
// reminder would slip to the eighth day.
const SLACK = 3600 * 1000;

export type TimedMovement = Movement & { kind: string; at: number };

export type ReminderMember = {
  id: string;
  /** Only people with an account can be emailed. */
  userId: string | null;
  remindedAt: number | null;
};

export type Reminder = { memberId: string; userId: string; owed: Settlement[] };

/**
 * When each member's current debt started: replays the expenses in the order they were added and
 * notes the moment each member's balance last went below zero. Members who don't owe anything are
 * left out. Paying part of a debt doesn't restart the clock; paying it all does.
 */
export function owingSince(memberIds: string[], movements: TimedMovement[]): Map<string, number> {
  const balance = new Map(memberIds.map((id) => [id, 0]));
  const since = new Map<string, number>();
  for (const m of [...movements].sort((a, b) => a.at - b.at)) {
    const changes: [string, number][] = [[m.paidBy, m.amount], ...m.shares.map((s): [string, number] => [s.memberId, -s.amount])];
    for (const [id, delta] of changes) {
      const before = balance.get(id) ?? 0;
      const after = before + delta;
      balance.set(id, after);
      if (after < 0 && before >= 0) since.set(id, m.at);
      if (after >= 0) since.delete(id);
    }
  }
  return since;
}

/**
 * The members to remind now: they have an account, have owed money for over a week, haven't paid
 * anything back in that week, have no payment waiting to be confirmed, and weren't reminded in the
 * last week. Each reminder lists who they owe, using the same suggested payments as the app.
 */
export function dueReminders(
  members: ReminderMember[],
  movements: TimedMovement[],
  openPaymentsFrom: Set<string>,
  at: number,
): Reminder[] {
  const ids = members.map((m) => m.id);
  const since = owingSince(ids, movements);
  const settlements = settle(balances(ids, movements));
  const lastPaid = new Map<string, number>();
  for (const m of movements) if (m.kind === "transfer") lastPaid.set(m.paidBy, Math.max(lastPaid.get(m.paidBy) ?? 0, m.at));

  const due: Reminder[] = [];
  for (const m of members) {
    if (!m.userId || openPaymentsFrom.has(m.id)) continue;
    const start = since.get(m.id);
    if (start === undefined || start > at - WEEK) continue;
    if ((lastPaid.get(m.id) ?? 0) > at - WEEK) continue;
    if (m.remindedAt !== null && m.remindedAt > at - WEEK + SLACK) continue;
    const owed = settlements.filter((s) => s.from === m.id);
    if (owed.length) due.push({ memberId: m.id, userId: m.userId, owed });
  }
  return due;
}
