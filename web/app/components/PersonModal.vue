<template>
  <UModal :title="person.isMe ? $t('person.youTitle') : person.name" :ui="{ content: 'sm:max-w-xl' }">
    <template #body>
      <div class="mb-5 flex items-center justify-between gap-3">
        <span class="text-muted first-letter:uppercase">{{ standing(person, awaiting) }}</span>
        <span
          class="shrink-0 rounded-md px-2.5 py-1 text-lg font-semibold whitespace-nowrap tabular-nums"
          :class="person.balance > 0 ? 'bg-success/10 text-success' : person.balance < 0 && !awaiting ? 'bg-error/10 text-error' : 'bg-elevated text-muted'"
        >
          {{ person.balance > 0 ? "+" : "" }}{{ money(person.balance, cur) }}
        </span>
      </div>

      <!-- Payments to confirm come first: for someone who is owed money, that's what this overview is for. -->
      <template v-if="payments.length">
        <h3 class="mb-2 font-semibold text-highlighted">{{ $t("payments.title") }}</h3>
        <GroupPaymentList :data="data" :payments="payments" class="mb-5" @changed="onChanged" />
      </template>

      <template v-if="settlements.length">
        <h3 class="mb-2 font-semibold text-highlighted">{{ settleHeading }}</h3>
        <GroupSettlementList :data="data" :settlements="settlements" class="mb-5" @changed="onChanged" />
      </template>

      <!-- The expenses stay in this overview: the button folds them open below it, so paying never loses your place. -->
      <p v-if="!expenses.length" class="text-sm text-muted">{{ $t(person.isMe ? "person.noExpensesYou" : "person.noExpenses", { name: person.name }) }}</p>
      <template v-else>
        <UButton
          block
          size="lg"
          color="neutral"
          variant="outline"
          icon="i-lucide-receipt"
          :trailing-icon="showExpenses ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
          class="justify-start"
          :ui="{ trailingIcon: 'ms-auto' }"
          :aria-expanded="showExpenses"
          :label="$t(person.isMe ? 'person.viewExpensesYou' : 'person.viewExpenses', { name: person.name, count: expenses.length }, expenses.length)"
          @click="showExpenses = !showExpenses"
        />
        <UCard v-if="showExpenses" class="mt-3" :ui="{ body: 'p-0 sm:p-0' }">
          <ul class="divide-y divide-default">
            <li v-for="e in expenses" :key="e.id">
              <button type="button" class="flex w-full items-center gap-3 px-4 py-3 text-start transition-colors hover:bg-elevated/60" @click="openExpense(e)">
                <span class="min-w-0 flex-1">
                  <span class="block truncate font-semibold text-highlighted">{{ expenseTitle(e) }}</span>
                  <span class="block truncate text-sm text-muted">{{ formatDate(e.date) }}</span>
                </span>
                <span class="text-end font-semibold whitespace-nowrap tabular-nums text-highlighted">
                  {{ money(e.amount, cur) }}
                  <span class="block text-sm font-normal" :class="e.kind === 'transfer' ? 'text-muted' : tone(net(e))">{{ note(e) }}</span>
                </span>
              </button>
            </li>
          </ul>
        </UCard>
      </template>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { ExpenseModal } from "#components";

/** One person's balance: who they pay or get paid by, with the pay and confirm actions, and their expenses folded in below. */
const props = defineProps<{ data: GroupData; memberId: string; onChanged: () => void }>();
const { t } = useI18n();
const { money, formatDate } = useFormat();
const { expenseTitle } = useMemberNames(() => props.data);
const standing = useStanding();
const overlay = useOverlay();
const expenseModal = overlay.create(ExpenseModal);

const cur = computed(() => props.data.group.currency);
const person = computed(() => props.data.members.find((m) => m.id === props.memberId)!);
const awaiting = computed(() => awaitingConfirmation(props.data, props.memberId));
const involves = (x: { from: string; to: string }) => x.from === props.memberId || x.to === props.memberId;
const payments = computed(() => props.data.payments.filter(involves));
const settlements = computed(() => props.data.settlements.filter(involves));
const expenses = computed(() => props.data.expenses.filter((e) => expenseInvolves(e, props.memberId)));
const showExpenses = ref(false);

const settleHeading = computed(() => {
  if (!person.value.isMe) return t("balances.settleUp");
  return t(person.value.balance < 0 ? "person.toPay" : "person.toReceive");
});

/** What this person paid minus their share: positive when they're ahead on it. */
const net = (e: Expense) => {
  const share = e.shares.find((s) => s.memberId === props.memberId)?.amount ?? 0;
  return (e.paidBy === props.memberId ? e.amount : 0) - share;
};

function note(e: Expense) {
  const n = net(e);
  if (n === 0) return "";
  const amount = money(Math.abs(n), cur.value);
  if (person.value.isMe) {
    const key = e.kind === "transfer" ? (n > 0 ? "expenses.youGave" : "expenses.youReceived") : n > 0 ? "expenses.youLent" : "expenses.youOwe";
    return t(key, { amount });
  }
  const key = e.kind === "transfer" ? (n > 0 ? "person.gave" : "person.received") : n > 0 ? "person.lent" : "person.owes";
  return t(key, { amount });
}

// Opens over this overview, so closing the expense lands back here.
async function openExpense(e: Expense) {
  if (await expenseModal.open({ data: props.data, expense: e }).result) props.onChanged();
}
</script>
