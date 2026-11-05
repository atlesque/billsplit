// Which state the confirm link from a "payment sent" email is in. No imports, so it can be unit
// tested in plain Node; src/payments.ts loads the payment and acts on the state.

export type PaymentLinkState = "open" | "confirmed" | "failed" | "expired" | "wrong_account";

/** What the confirm page shows for a link, given the payment it points to (or null) and who is signed in. */
export function paymentLinkState(
  p: { status: string; to_user: string | null; confirm_expires_at: number } | null,
  userId: string,
  at: number,
): PaymentLinkState {
  // Unknown links (also those of a cancelled payment, which is deleted) read as expired.
  if (!p) return "expired";
  // Someone else's link says nothing about the payment.
  if (p.to_user !== userId) return "wrong_account";
  if (p.status === "received") return "confirmed";
  if (p.status === "failed") return "failed";
  if (p.confirm_expires_at <= at) return "expired";
  return "open";
}
