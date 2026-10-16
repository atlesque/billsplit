/** "gets back", "owes" or "settled up", in the second person for you. */
export function useStanding() {
  const { t } = useI18n();
  return (m: { balance: number; isMe: boolean }) => {
    if (m.balance > 0) return t(m.isMe ? "balances.youGetBack" : "balances.getsBack");
    if (m.balance < 0) return t(m.isMe ? "balances.youOwe" : "balances.owes");
    return t(m.isMe ? "balances.youSettled" : "balances.settled");
  };
}
