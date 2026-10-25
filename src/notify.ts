// Payment emails: the recipient hears when someone marks a payment to them as sent, and the payer
// hears when the recipient confirms the money arrived. Each goes out in the language the person
// last used the app in. Sending never blocks or fails the payment itself; failures are only logged.

import { now, randomId } from "./http";
import { LANGS, tr, type Lang } from "./i18n";
import { formatAmount, oneLine, paymentEmailHtml, paymentEmailText } from "./payment-email";

export type PaymentEmail = {
  kind: "payment_sent" | "payment_received";
  /** The account to email. */
  userId: string;
  groupId: string;
  /** Member names as shown in the group. */
  from: string;
  to: string;
  amountCents: number;
};

/** Sends one payment email. Never throws: a payment is recorded whether or not the email goes out. */
export async function sendPaymentEmail(env: Env, email: PaymentEmail): Promise<void> {
  // Staging has no email sending.
  if (env.STAGING === "true" || !env.EMAIL) return;
  try {
    const row = await env.DB.prepare(
      `SELECT u.email, u.lang, g.name AS group_name, g.currency FROM users u, groups g WHERE u.id = ? AND g.id = ?`,
    )
      .bind(email.userId, email.groupId)
      .first<{ email: string; lang: string; group_name: string; currency: string }>();
    if (!row) return;
    const lang: Lang = (LANGS as string[]).includes(row.lang) ? (row.lang as Lang) : "en";
    const amount = formatAmount(email.amountCents, row.currency, lang);
    const text = paymentEmailText(email.kind, (t, p) => tr(lang, t, p), { from: email.from, to: email.to, amount, group: row.group_name });
    const link = `${env.APP_URL}/g/${email.groupId}`;
    const footer = tr(lang, "You get this email because you're in {group} on BillSplit.", { group: oneLine(row.group_name) });
    const log = (status: "sent" | "failed", extra: { error?: string; messageId?: string } = {}) =>
      env.DB.prepare(
        `INSERT INTO email_log (id, to_email, kind, subject, status, error, message_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(randomId(), row.email, email.kind, text.subject, status, extra.error ?? null, extra.messageId ?? null, now())
        .run();
    try {
      const result = await env.EMAIL.send({
        to: row.email,
        from: { email: env.EMAIL_FROM, name: "BillSplit" },
        subject: text.subject,
        text: `${text.intro}\n\n${text.button}: ${link}\n\n${footer}`,
        html: paymentEmailHtml(lang, text.intro, text.button, link, footer),
      });
      await log("sent", { messageId: result?.messageId });
    } catch (error) {
      const e = error as { code?: string; message?: string };
      console.error("Payment email failed", e.code, e.message);
      await log("failed", { error: [e.code, e.message].filter(Boolean).join(": ") || "unknown" });
    }
  } catch (error) {
    console.error("Payment email failed", error);
  }
}
