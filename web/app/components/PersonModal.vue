<template>
  <UModal :title="person.isMe ? $t('person.youTitle') : person.name" :ui="{ content: 'sm:max-w-xl' }">
    <template #body>
      <div class="mb-5 flex items-center justify-between gap-3">
        <span class="text-muted first-letter:uppercase">{{ standing(person) }}</span>
        <span
          class="shrink-0 rounded-md px-2.5 py-1 text-lg font-semibold whitespace-nowrap tabular-nums"
          :class="person.balance > 0 ? 'bg-success/10 text-success' : person.balance < 0 ? 'bg-error/10 text-error' : 'bg-elevated text-muted'"
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

      <!-- The expenses themselves live on the Expenses tab: this opens it, showing only the ones this person is in. -->
      <p v-if="!expenseCount" class="text-sm text-muted">{{ $t(person.isMe ? "person.noExpensesYou" : "person.noExpenses", { name: person.name }) }}</p>
      <UButton
        v-else
        block
        size="lg"
        color="neutral"
        variant="outline"
        icon="i-lucide-receipt"
        trailing-icon="i-lucide-chevron-right"
        class="justify-start"
        :ui="{ trailingIcon: 'ms-auto' }"
        :label="$t(person.isMe ? 'person.viewExpensesYou' : 'person.viewExpenses', { name: person.name, count: expenseCount }, expenseCount)"
        @click="viewExpenses"
      />
    </template>
  </UModal>
</template>

<script setup lang="ts">
/** One person's balance: who they pay or get paid by, with the pay and confirm actions, and a way to their expenses. */
const props = defineProps<{ data: GroupData; memberId: string; onChanged: () => void; onExpenses: (memberId: string) => void }>();
const emit = defineEmits<{ close: [] }>();
const { t } = useI18n();
const { money } = useFormat();
const standing = useStanding();

const cur = computed(() => props.data.group.currency);
const person = computed(() => props.data.members.find((m) => m.id === props.memberId)!);
const involves = (x: { from: string; to: string }) => x.from === props.memberId || x.to === props.memberId;
const payments = computed(() => props.data.payments.filter(involves));
const settlements = computed(() => props.data.settlements.filter(involves));
const expenseCount = computed(() => props.data.expenses.filter((e) => expenseInvolves(e, props.memberId)).length);

const settleHeading = computed(() => {
  if (!person.value.isMe) return t("balances.settleUp");
  return t(person.value.balance < 0 ? "person.toPay" : "person.toReceive");
});

function viewExpenses() {
  emit("close");
  props.onExpenses(props.memberId);
}
</script>
