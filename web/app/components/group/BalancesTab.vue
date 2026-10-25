<template>
  <div>
    <!-- Payments that one side marked and the other still has to confirm. -->
    <template v-if="data.payments.length">
      <h2 class="mb-2 text-lg font-semibold text-highlighted">{{ $t("payments.title") }}</h2>
      <p v-if="toConfirm" class="mb-2 text-sm text-muted">{{ $t("payments.checkHelp") }}</p>
      <GroupPaymentList :data="data" :payments="data.payments" class="mb-6" @changed="emit('changed')" />
    </template>

    <h2 class="mb-2 text-lg font-semibold text-highlighted">{{ $t("balances.title") }}</h2>
    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <ul class="divide-y divide-default">
        <!-- Who is ahead or behind, as a word and a tinted amount: no bars, so the list reads calmly. Tap a person for their expenses. -->
        <li v-for="m in data.members" :key="m.id">
          <button
            type="button"
            class="flex w-full items-center gap-3 px-4 py-3 text-start transition-colors hover:bg-elevated/60"
            :aria-label="$t('person.open', { name: m.name })"
            @click="emit('person', m.id)"
          >
            <span class="min-w-0 flex-1">
              <span class="block truncate font-semibold text-highlighted">{{ m.isMe ? $t("nameYou", { name: m.name }) : m.name }}</span>
              <span class="block text-sm text-muted">{{ standing(m, awaitingConfirmation(data, m.id)) }}</span>
            </span>
            <span
              class="shrink-0 rounded-md px-2.5 py-1 font-semibold whitespace-nowrap tabular-nums"
              :class="pill(m)"
            >
              {{ m.balance > 0 ? "+" : "" }}{{ money(m.balance, cur) }}
            </span>
            <UIcon name="i-lucide-chevron-right" class="size-4 shrink-0 text-dimmed" />
          </button>
        </li>
      </ul>
    </UCard>

    <h2 class="mt-6 mb-2 text-lg font-semibold text-highlighted">{{ $t("balances.settleUp") }}</h2>
    <template v-if="data.settlements.length">
      <p class="mb-2 text-sm text-muted">{{ $t("balances.settleHelp") }}</p>
      <GroupSettlementList :data="data" :settlements="data.settlements" @changed="emit('changed')" />
    </template>
    <UCard v-else class="py-4 text-center text-muted">{{ $t("balances.allSettled") }}</UCard>

    <h2 class="mt-6 mb-2 text-lg font-semibold text-highlighted">{{ $t("balances.totals") }}</h2>
    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <ul class="divide-y divide-default">
        <li v-for="m in data.members" :key="m.id" class="flex flex-wrap items-center justify-between gap-x-3 px-4 py-3">
          <span>{{ m.name }}</span>
          <span class="text-sm text-muted tabular-nums">{{ $t("balances.paidShare", { paid: money(m.paid, cur), share: money(m.spent, cur) }) }}</span>
        </li>
      </ul>
    </UCard>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ data: GroupData }>();
const emit = defineEmits<{ changed: []; person: [memberId: string] }>();
const { money } = useFormat();
const standing = useStanding();
// Owing money you already sent isn't red any more: it's only waiting for the other side.
const pill = (m: { id: string; balance: number }) =>
  m.balance > 0 ? "bg-success/10 text-success" : m.balance < 0 && !awaitingConfirmation(props.data, m.id) ? "bg-error/10 text-error" : "bg-elevated text-muted";

const cur = computed(() => props.data.group.currency);
const toConfirm = computed(() => props.data.payments.some((p) => p.canConfirm && p.status !== "failed"));
</script>
