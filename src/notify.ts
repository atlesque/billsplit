// Emails sent on someone else's action or on a schedule: the recipient of a payment hears when it is
// marked as sent, the payer when it is received, and people who have owed money for over a week get
// a reminder if the group has them turned on (src/reminders.ts). Each goes out in the language the
// person last used the app in. Sending never blocks or fails anything else; failures are only logged.

import { now, randomId } from "./http";
import { LANGS, tr, type Lang } from "./i18n";
import { CONFIRM_LINK_DAYS, formatAmount, oneLine, paymentEmailHtml, paymentEmailText, reminderEmailText } from "./payment-email";

export type PaymentEmail = {
  kind: "payment_sent" | "payment_received";
  /** The account to email. */
  userId: string;
  groupId: string;
  /** Member names as shown in the group. */
  from: string;
  to: string;
  amountCents: number;
  /** Where the button goes, from the app's root. Defaults to the group page. */
  path?: string;
};

type Recipient = { email: string; lang: Lang; groupName: string; currency: string };
type Content = { subject: string; intro: string; button: string; footer: string };

/** Emails one group member. Never throws; resolves to whether the email went out. */
async function sendGroupEmail(
  env: Env,
  kind: string,
  userId: string,
  groupId: string,
  content: (r: Recipient, amount: (cents: number) => string) => Content,
  path = `/g/${groupId}`,
): Promise<boolean> {
  // Staging has no email sending.
  if (env.STAGING === "true" || !env.EMAIL) return false;
  try {
    const row = await env.DB.prepare(
      `SELECT u.email, u.lang, g.name AS group_name, g.currency FROM users u, groups g WHERE u.id = ? AND g.id = ?`,
    )
      .bind(userId, groupId)
      .first<{ email: string; lang: string; group_name: string; currency: string }>();
    if (!row) return false;
    const lang: Lang = (LANGS as string[]).includes(row.lang) ? (row.lang as Lang) : "en";
    const r = { email: row.email, lang, groupName: row.group_name, currency: row.currency };
    const text = content(r, (cents) => formatAmount(cents, row.currency, lang));
    const link = `${env.APP_URL}${path}`;
    const log = (status: "sent" | "failed", extra: { error?: string; messageId?: string } = {}) =>
      env.DB.prepare(
        `INSERT INTO email_log (id, to_email, kind, subject, status, error, message_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(randomId(), row.email, kind, text.subject, status, extra.error ?? null, extra.messageId ?? null, now())
        .run();
    try {
      const result = await env.EMAIL.send({
        to: row.email,
        from: { email: env.EMAIL_FROM, name: "BillSplit" },
        subject: text.subject,
        text: `${text.intro}\n\n${text.button}: ${link}\n\n${text.footer}`,
        html: paymentEmailHtml(lang, text.intro, text.button, link, text.footer),
      });
      await log("sent", { messageId: result?.messageId });
      return true;
    } catch (error) {
      const e = error as { code?: string; message?: string };
      console.error(`Email ${kind} failed`, e.code, e.message);
      await log("failed", { error: [e.code, e.message].filter(Boolean).join(": ") || "unknown" });
      return false;
    }
  } catch (error) {
    console.error(`Email ${kind} failed`, error);
    return false;
  }
}

/** Sends one payment email. Never throws: a payment is recorded whether or not the email goes out. */
export async function sendPaymentEmail(env: Env, email: PaymentEmail): Promise<void> {
  await sendGroupEmail(env, email.kind, email.userId, email.groupId, (r, amount) => ({
    ...paymentEmailText(email.kind, (t, p) => tr(r.lang, t, p), { from: email.from, to: email.to, amount: amount(email.amountCents), group: r.groupName }),
    footer: [
      email.path && email.kind === "payment_sent" ? tr(r.lang, "The button works for {days} days. After that, you can confirm the payment in the group.", { days: CONFIRM_LINK_DAYS }) : "",
      tr(r.lang, "You get this email because you're in {group} on BillSplit.", { group: oneLine(r.groupName) }),
    ]
      .filter(Boolean)
      .join(" "),
  }), email.path);
}

/** Reminds someone what they still owe in a group. Resolves to whether the email went out. */
export function sendReminderEmail(env: Env, userId: string, groupId: string, owed: { to: string; amountCents: number }[]): Promise<boolean> {
  return sendGroupEmail(env, "payment_reminder", userId, groupId, (r, amount) => ({
    ...reminderEmailText(
      (t, p) => tr(r.lang, t, p),
      r.groupName,
      owed.map((o) => ({ to: o.to, amount: amount(o.amountCents) })),
      amount(owed.reduce((sum, o) => sum + o.amountCents, 0)),
    ),
    footer: tr(r.lang, "You get this reminder because payment reminders are on for {group}. The group owner can turn them off in the group settings.", {
      group: oneLine(r.groupName),
    }),
  }));
}
