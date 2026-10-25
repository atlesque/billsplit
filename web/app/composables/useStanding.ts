/** "gets back", "owes", "sent, awaiting confirmation" or "settled up", in the second person for you. */
export function useStanding() {
  const { t } = useI18n();
  return (m: { balance: number; isMe: boolean }, awaiting = false) => {
    if (m.balance > 0) return t(m.isMe ? "balances.youGetBack" : "balances.getsBack");
    if (m.balance < 0 && awaiting) return t(m.isMe ? "balances.youAwaiting" : "balances.awaiting");
    if (m.balance < 0) return t(m.isMe ? "balances.youOwe" : "balances.owes");
    return t(m.isMe ? "balances.youSettled" : "balances.settled");
  };
}
