/** A payment for this settlement was marked as sent and is still open (not failed). */
export const settlementPending = (data: GroupData, s: { from: string; to: string }) =>
  data.payments.some((p) => p.from === s.from && p.to === s.to && p.status !== "failed");

/** Someone who owes money but marked all of it as sent, so they're only waiting for confirmation. */
export function awaitingConfirmation(data: GroupData, memberId: string) {
  const owed = -(data.members.find((m) => m.id === memberId)?.balance ?? 0);
  const sent = data.payments.filter((p) => p.from === memberId && p.status !== "failed").reduce((a, p) => a + p.amount, 0);
  return owed > 0 && sent >= owed;
}
