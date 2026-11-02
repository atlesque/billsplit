import assert from "node:assert/strict";
import { test } from "node:test";
import { tr, type Lang } from "../src/i18n.ts";
import { reminderEmailText } from "../src/payment-email.ts";
import { dueReminders, owingSince, WEEK, type ReminderMember, type TimedMovement } from "../src/reminder-rules.ts";

const DAY = 24 * 3600 * 1000;
const NOW = 100 * DAY;
const ago = (days: number) => NOW - days * DAY;

// Alex pays 90 for three people, so Bob and Cara each owe Alex 30.
const dinner = (at: number): TimedMovement => ({
  kind: "expense",
  at,
  paidBy: "alex",
  amount: 9000,
  shares: [
    { memberId: "alex", amount: 3000 },
    { memberId: "bob", amount: 3000 },
    { memberId: "cara", amount: 3000 },
  ],
});
const payment = (from: string, to: string, amount: number, at: number): TimedMovement => ({
  kind: "transfer",
  at,
  paidBy: from,
  amount,
  shares: [{ memberId: to, amount }],
});
const people = (overrides: Partial<Record<string, Partial<ReminderMember>>> = {}): ReminderMember[] =>
  ["alex", "bob", "cara"].map((id) => ({ id, userId: `u-${id}`, remindedAt: null, ...overrides[id] }));
const remindedIds = (r: { memberId: string }[]) => r.map((x) => x.memberId).sort();

test("reminders: everyone who has owed for over a week, not before", () => {
  assert.deepEqual(remindedIds(dueReminders(people(), [dinner(ago(8))], new Set(), NOW)), ["bob", "cara"]);
  assert.deepEqual(dueReminders(people(), [dinner(ago(6))], new Set(), NOW), []);
});

test("reminders: lists who they owe and how much", () => {
  const [bob] = dueReminders(people(), [dinner(ago(8))], new Set(), NOW).filter((r) => r.memberId === "bob");
  assert.deepEqual(bob, { memberId: "bob", userId: "u-bob", owed: [{ from: "bob", to: "alex", amount: 3000 }] });
});

test("reminders: nobody without an account, and nobody with a payment waiting to be confirmed", () => {
  const due = dueReminders(people({ cara: { userId: null } }), [dinner(ago(8))], new Set(["bob"]), NOW);
  assert.deepEqual(due, []);
});

test("reminders: at most once a week", () => {
  assert.deepEqual(remindedIds(dueReminders(people({ bob: { remindedAt: ago(3) } }), [dinner(ago(20))], new Set(), NOW)), ["cara"]);
  // The daily run starts a little later or earlier each day; a week later still counts as a week.
  const almostWeek = NOW - WEEK + 60_000;
  assert.deepEqual(remindedIds(dueReminders(people({ bob: { remindedAt: almostWeek } }), [dinner(ago(20))], new Set(), NOW)), ["bob", "cara"]);
});

test("reminders: paying part back gives a week's rest; the clock doesn't restart", () => {
  const moves = [dinner(ago(20)), payment("bob", "alex", 1000, ago(2))];
  assert.deepEqual(remindedIds(dueReminders(people(), moves, new Set(), NOW)), ["cara"]);
  assert.equal(owingSince(["alex", "bob", "cara"], moves).get("bob"), ago(20));
  const later = [dinner(ago(20)), payment("bob", "alex", 1000, ago(9))];
  assert.deepEqual(remindedIds(dueReminders(people(), later, new Set(), NOW)), ["bob", "cara"]);
});

test("reminders: paying it all back and owing again starts a new week", () => {
  const moves = [dinner(ago(30)), payment("bob", "alex", 3000, ago(25)), dinner(ago(3))];
  assert.equal(owingSince(["alex", "bob", "cara"], moves).get("bob"), ago(3));
  assert.deepEqual(remindedIds(dueReminders(people(), moves, new Set(), NOW)), ["cara"]);
});

test("reminders: the person who is owed is never reminded", () => {
  assert.equal(owingSince(["alex", "bob", "cara"], [dinner(ago(8))]).has("alex"), false);
});

const t = (lang: Lang) => (text: string, params?: Record<string, string | number>) => tr(lang, text, params);

test("reminder email: one or more people owed, in English and Dutch", () => {
  const one = reminderEmailText(t("en"), "Ski trip", [{ to: "Alex", amount: "€30.00" }], "€30.00");
  assert.equal(one.subject, "Reminder: you owe €30.00 in Ski trip");
  assert.match(one.intro, /^You've owed Alex €30.00 in Ski trip for over a week\. Open BillSplit/);
  const two = reminderEmailText(t("nl"), "Ski trip", [{ to: "Alex", amount: "€ 30,00" }, { to: "Cara", amount: "€ 5,00" }], "€ 35,00");
  assert.equal(two.subject, "Herinnering: je moet nog € 35,00 betalen voor Ski trip");
  assert.match(two.intro, /Ski trip: € 30,00 aan Alex, € 5,00 aan Cara\./);
  assert.equal(two.button, "Nu betalen");
});

test("reminder email: names never break the subject line", () => {
  const { subject } = reminderEmailText(t("en"), "Ski\r\nBcc: x@y.z", [{ to: "Alex", amount: "€1" }], "€1");
  assert.doesNotMatch(subject, /[\r\n]/);
});
