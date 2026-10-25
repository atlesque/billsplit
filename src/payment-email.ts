// Pure helpers for the payment emails (src/notify.ts), with no imports so they can be unit tested
// in plain Node. Text goes through `t`, which is `tr` from src/i18n.ts bound to the reader's language.

type Translate = (text: string, params?: Record<string, string | number>) => string;

export const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// Names end up in the Subject header, so they never carry line breaks.
export const oneLine = (value: string) => value.replace(/[\r\n]+/g, " ");

export function formatAmount(cents: number, currency: string, lang: string): string {
  try {
    return new Intl.NumberFormat(lang, { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

/** Subject, intro line and button text for one payment email. */
export function paymentEmailText(
  kind: "payment_sent" | "payment_received",
  t: Translate,
  params: { from: string; to: string; amount: string; group: string },
) {
  const p = { ...params, from: oneLine(params.from), to: oneLine(params.to), group: oneLine(params.group) };
  return kind === "payment_sent"
    ? {
        subject: t("{from} sent you {amount}", p),
        intro: t("{from} says they sent you {amount} in {group}. Check your bank account and confirm in BillSplit once the money has arrived.", p),
        button: t("Confirm the payment"),
      }
    : {
        subject: t("{to} received your {amount}", p),
        intro: t("{to} confirmed that your payment of {amount} in {group} arrived. It now counts towards your balance.", p),
        button: t("Open {group}", p),
      };
}

export function paymentEmailHtml(lang: string, intro: string, button: string, link: string, footer: string): string {
  return `<!doctype html><html lang="${lang}"><body style="margin:0;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1d2433">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#fff;border-radius:14px;padding:32px">
<tr><td style="font-size:20px;font-weight:700;padding-bottom:8px">BillSplit</td></tr>
<tr><td style="font-size:15px;line-height:1.5;padding:8px 0 24px">${escapeHtml(intro)}</td></tr>
<tr><td style="padding-bottom:24px"><a href="${escapeHtml(link)}" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px">${escapeHtml(button)}</a></td></tr>
<tr><td style="font-size:13px;color:#667085;line-height:1.5">${escapeHtml(footer)}</td></tr>
</table></td></tr></table></body></html>`;
}
