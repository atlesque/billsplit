/** Display names in a group: "You" for yourself, with `object` for the form after a verb ("paid you"). */
export function useMemberNames(data: () => GroupData) {
  const { t } = useI18n();
  const byId = computed(() => new Map(data().members.map((m) => [m.id, m])));
  const name = (id: string | undefined, { object = false } = {}) =>
    id === data().meId ? t(object ? "youObject" : "you") : (byId.value.get(id ?? "")?.name ?? "?");
  /** "Alex (you)" in pickers. */
  const label = (m: Member) => (m.id === data().meId ? t("nameYou", { name: m.name }) : m.name);
  // Payments are stored with the English title "Payment".
  const expenseTitle = (e: Expense) => (e.kind === "transfer" && e.title === "Payment" ? t("expense.payment") : e.title);
  const categoryLabel = (c: string) => (CATEGORIES[c] ? t(`category.${CATEGORIES[c]}`) : c);
  return { name, label, expenseTitle, categoryLabel };
}
