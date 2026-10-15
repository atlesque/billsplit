<template>
  <div>
    <h2 class="mb-2 text-lg font-semibold text-highlighted">{{ $t("balances.title") }}</h2>
    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <ul class="divide-y divide-default">
        <li v-for="m in data.members" :key="m.id" class="flex items-center gap-3 px-4 py-2.5">
          <span class="w-1/3 min-w-0 truncate font-semibold text-highlighted">{{ m.isMe ? $t("nameYou", { name: m.name }) : m.name }}</span>
          <span class="grid h-6 flex-1 grid-cols-2" aria-hidden="true">
            <span class="relative border-e border-default">
              <span v-if="m.balance < 0" class="absolute inset-y-0.5 end-0 rounded bg-orange-500/80" :style="{ width: `${(Math.abs(m.balance) / max) * 100}%` }" />
            </span>
            <span class="relative">
              <span v-if="m.balance > 0" class="absolute inset-y-0.5 start-0 rounded bg-emerald-500/80" :style="{ width: `${(m.balance / max) * 100}%` }" />
            </span>
          </span>
          <span class="w-28 text-end font-semibold whitespace-nowrap tabular-nums" :class="tone(m.balance)">{{ m.balance > 0 ? "+" : "" }}{{ money(m.balance, cur) }}</span>
        </li>
      </ul>
    </UCard>

    <h2 class="mt-6 mb-2 text-lg font-semibold text-highlighted">{{ $t("balances.settleUp") }}</h2>
    <template v-if="data.settlements.length">
      <p class="mb-2 text-sm text-muted">{{ $t("balances.settleHelp") }}</p>
      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <ul class="divide-y divide-default">
          <li v-for="(s, i) in data.settlements" :key="i" class="flex items-center gap-3 px-4 py-3">
            <i18n-t :keypath="s.from === data.meId ? 'balances.youPay' : 'balances.pays'" tag="span" class="min-w-0 flex-1" scope="global">
              <template #you><strong>{{ $t("you") }}</strong></template>
              <template #from><strong>{{ name(s.from) }}</strong></template>
              <template #to><strong>{{ name(s.to, { object: true }) }}</strong></template>
            </i18n-t>
            <span class="font-semibold whitespace-nowrap tabular-nums">{{ money(s.amount, cur) }}</span>
            <UButton size="sm" color="neutral" variant="outline" :label="$t('balances.markPaid')" @click="emit('settle', s)" />
          </li>
        </ul>
      </UCard>
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
const emit = defineEmits<{ settle: [settlement: Settlement] }>();
const { money } = useFormat();
const { name } = useMemberNames(() => props.data);
const cur = computed(() => props.data.group.currency);
const max = computed(() => Math.max(1, ...props.data.members.map((m) => Math.abs(m.balance))));
</script>
