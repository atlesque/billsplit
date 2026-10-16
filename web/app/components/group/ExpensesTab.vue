<template>
  <UCard v-if="!data.expenses.length" class="py-6 text-center">
    <p class="mb-4 text-muted">{{ $t("expenses.empty") }}</p>
    <UButton v-if="!archived" icon="i-lucide-plus" :label="$t('expenses.addFirst')" @click="emit('add')" />
  </UCard>
  <div v-else>
    <!-- Full width and left-aligned, so it reads in line with the tabs and the list below. -->
    <UButton v-if="!archived" block size="lg" icon="i-lucide-plus" class="justify-start" :label="$t('group.addExpense')" @click="emit('add')" />
    <template v-for="([date, list], i) in byDate" :key="date">
      <div :class="i === 0 && archived ? '' : 'pt-4'" class="px-1 pb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">{{ formatDate(date) }}</div>
      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <ul class="divide-y divide-default">
          <li v-for="e in list" :key="e.id">
            <button type="button" class="flex w-full items-center gap-3 px-4 py-3 text-start transition-colors hover:bg-elevated/60" @click="emit('open', e)">
              <UAvatar
                v-if="e.kind === 'transfer'"
                icon="i-lucide-arrow-left-right"
                size="lg"
                :ui="{ root: 'bg-elevated', icon: 'text-muted' }"
              />
              <UAvatar v-else :text="initials(e.title)" size="lg" :ui="{ root: 'bg-elevated', fallback: 'text-primary font-bold' }" />
              <span class="min-w-0 flex-1">
                <span class="flex items-center gap-1.5 font-semibold text-highlighted">
                  <span class="truncate">{{ expenseTitle(e) }}</span>
                  <UIcon
                    v-if="e.attachments?.length"
                    name="i-lucide-paperclip"
                    class="size-3.5 shrink-0 text-muted"
                    :aria-label="$t('attachments.count', e.attachments.length)"
                  />
                </span>
                <span class="block truncate text-sm text-muted">{{ subtitle(e) }}</span>
              </span>
              <span class="text-end font-semibold whitespace-nowrap tabular-nums text-highlighted">
                {{ money(e.amount, cur) }}
                <span class="block text-sm font-normal" :class="e.kind === 'transfer' ? 'text-muted' : tone(myNet(e))">{{ note(e) }}</span>
              </span>
            </button>
          </li>
        </ul>
      </UCard>
    </template>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ data: GroupData }>();
const emit = defineEmits<{ add: []; open: [expense: Expense] }>();
const { t } = useI18n();
const { money, formatDate } = useFormat();
const { name, expenseTitle, categoryLabel } = useMemberNames(() => props.data);

const cur = computed(() => props.data.group.currency);
const archived = computed(() => Boolean(props.data.group.archived_at));
const byDate = computed(() => {
  const map = new Map<string, Expense[]>();
  for (const e of props.data.expenses) map.set(e.date, [...(map.get(e.date) ?? []), e]);
  return [...map];
});

const myNet = (e: Expense) => {
  const myShare = e.shares.find((s) => s.memberId === props.data.meId)?.amount ?? 0;
  return (e.paidBy === props.data.meId ? e.amount : 0) - myShare;
};

function subtitle(e: Expense) {
  if (e.kind === "transfer") return t("expenses.transferSub", { from: name(e.paidBy), to: name(e.shares[0]?.memberId, { object: true }) });
  const paidBy = e.paidBy === props.data.meId ? t("expenses.paidByYou") : t("expenses.paidBy", { name: name(e.paidBy) });
  return e.category ? `${paidBy} · ${categoryLabel(e.category)}` : paidBy;
}

function note(e: Expense) {
  const net = myNet(e);
  if (net === 0) return "";
  const key = e.kind === "transfer" ? (net > 0 ? "expenses.youGave" : "expenses.youReceived") : net > 0 ? "expenses.youLent" : "expenses.youOwe";
  return t(key, { amount: money(Math.abs(net), cur.value) });
}
</script>
