<template>
  <div class="space-y-3">
    <!-- What you owe and what you're owed get a card each, side by side from sm up so both always read at a glance. -->
    <div class="grid gap-3 sm:grid-cols-2">
      <!-- What you owe comes first, and the whole card is the way to pay it. Once you've sent it all, it turns neutral: you're only waiting for confirmation. -->
      <button
        v-if="mine.balance < 0"
        type="button"
        :class="[card, awaiting ? 'hover:bg-elevated/60' : 'ring-error/40 bg-error/5 hover:bg-error/10']"
        @click="emit('person', mine.id)"
      >
        <span class="flex items-start gap-3">
          <span class="min-w-0 flex-1">
            <span class="block text-sm text-muted">{{ $t(awaiting ? "balance.awaiting" : "balance.owe") }}</span>
            <span class="block text-2xl font-bold tabular-nums" :class="awaiting ? 'text-highlighted' : 'text-error'">{{ money(-mine.balance, cur) }}</span>
          </span>
          <span v-if="awaiting" class="mt-1 inline-flex shrink-0 items-center gap-1 text-sm text-muted">
            <UIcon name="i-lucide-hourglass" class="size-4" />{{ $t("overview.waiting") }}
          </span>
          <span v-else class="mt-1 inline-flex shrink-0 items-center gap-1 rounded-md bg-error px-3 py-1.5 text-sm font-semibold text-inverted">
            {{ $t("overview.pay") }}
            <UIcon name="i-lucide-chevron-right" class="size-4" />
          </span>
        </span>
        <ul v-if="toPay.length" class="mt-3 space-y-1 border-t pt-3 text-sm" :class="awaiting ? 'border-default' : 'border-error/20'">
          <li v-for="s in toPay" :key="s.to" class="flex items-center gap-2">
            <span class="min-w-0 flex-1 truncate">{{ $t("overview.to", { name: name(s.to, { object: true }) }) }}</span>
            <UBadge v-if="s.pending" color="neutral" variant="subtle" size="sm" :label="$t('payments.pending')" />
            <span class="font-semibold tabular-nums">{{ money(s.amount, cur) }}</span>
          </li>
        </ul>
      </button>
      <!-- Owing nothing is still worth saying, so it reads as an answer and not as a missing card. -->
      <div v-else :class="card">
        <span class="block text-sm text-muted">{{ $t("balance.owe") }}</span>
        <span class="block text-2xl font-bold tabular-nums text-muted">{{ money(0, cur) }}</span>
        <span class="mt-1 flex items-center gap-1.5 text-sm text-muted"><UIcon name="i-lucide-circle-check" class="size-4 shrink-0" />{{ $t("overview.oweNothing") }}</span>
      </div>

      <!-- What others owe you, in green, with the payments they say they sent waiting for you to confirm. -->
      <button v-if="mine.balance > 0 || paymentsToConfirm" type="button" :class="[card, 'ring-success/40 bg-success/5 hover:bg-success/10']" @click="emit('person', mine.id)">
        <span class="flex items-start gap-3">
          <span class="min-w-0 flex-1">
            <span class="block text-sm text-muted">{{ $t("balance.owed") }}</span>
            <span class="block text-2xl font-bold tabular-nums text-success">{{ money(Math.max(mine.balance, 0), cur) }}</span>
          </span>
          <span class="mt-1 inline-flex shrink-0 items-center gap-1 rounded-md bg-success/15 px-3 py-1.5 text-sm font-semibold text-success">
            {{ $t(paymentsToConfirm ? "overview.confirm" : "overview.view") }}
            <UIcon name="i-lucide-chevron-right" class="size-4" />
          </span>
        </span>
        <p v-if="paymentsToConfirm" class="mt-2 text-sm font-semibold text-highlighted">{{ $t("overview.toConfirm", paymentsToConfirm) }}</p>
        <ul v-if="toReceive.length" class="mt-3 space-y-1 border-t border-success/20 pt-3 text-sm">
          <li v-for="s in toReceive" :key="s.from" class="flex items-center gap-2">
            <span class="min-w-0 flex-1 truncate">{{ $t("overview.from", { name: name(s.from, { object: true }) }) }}</span>
            <UBadge v-if="s.pending" color="neutral" variant="subtle" size="sm" :label="$t('payments.statusToConfirm')" />
            <span class="font-semibold tabular-nums">{{ money(s.amount, cur) }}</span>
          </li>
        </ul>
      </button>
      <div v-else :class="card">
        <span class="block text-sm text-muted">{{ $t("balance.owed") }}</span>
        <span class="block text-2xl font-bold tabular-nums text-muted">{{ money(0, cur) }}</span>
        <span class="mt-1 flex items-center gap-1.5 text-sm text-muted"><UIcon name="i-lucide-circle-check" class="size-4 shrink-0" />{{ $t("overview.owedNothing") }}</span>
      </div>
    </div>

    <!-- The group's total leads to its expenses. -->
    <button type="button" :class="[card, 'flex items-center gap-3 hover:bg-elevated/60']" @click="emit('expenses')">
      <span class="min-w-0 flex-1">
        <span class="block text-sm text-muted">{{ $t("group.totalSpent") }}</span>
        <span class="block text-xl font-bold tabular-nums text-highlighted">{{ money(total, cur) }}</span>
        <span class="block text-sm text-muted">{{ $t("overview.expenseCount", expenseCount) }}</span>
      </span>
      <span class="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-muted">
        <span class="hidden sm:inline">{{ $t("overview.viewExpenses") }}</span>
        <UIcon name="i-lucide-chevron-right" class="size-5" />
      </span>
    </button>

    <!-- Full width and left-aligned, like on the Expenses tab: the one filled primary button. -->
    <UButton v-if="!data.group.archived_at" block size="lg" icon="i-lucide-plus" class="mt-2 justify-start" :label="$t('group.addExpense')" @click="emit('add')" />
  </div>
</template>

<script setup lang="ts">
/** The group at a glance: what you owe, what you're owed and what the group spent, each leading to where you act on it. */
const props = defineProps<{ data: GroupData }>();
const emit = defineEmits<{ person: [memberId: string]; expenses: []; add: [] }>();
const { money } = useFormat();
const { name } = useMemberNames(() => props.data);

// Shaped like a UCard, but the whole card is the button.
const card = "block w-full rounded-[calc(var(--ui-radius)*2)] bg-default p-4 text-start ring ring-default transition-colors";

const cur = computed(() => props.data.group.currency);
const mine = computed(() => props.data.members.find((m) => m.id === props.data.meId)!);
const expenses = computed(() => props.data.expenses.filter((e) => e.kind === "expense"));
const total = computed(() => expenses.value.reduce((a, e) => a + e.amount, 0));
const expenseCount = computed(() => expenses.value.length);

const pendingFor = (s: Settlement) => settlementPending(props.data, s);
const toPay = computed(() => props.data.settlements.filter((s) => s.from === props.data.meId).map((s) => ({ ...s, pending: pendingFor(s) })));
const toReceive = computed(() => props.data.settlements.filter((s) => s.to === props.data.meId).map((s) => ({ ...s, pending: pendingFor(s) })));
const awaiting = computed(() => awaitingConfirmation(props.data, props.data.meId));
const paymentsToConfirm = computed(() => props.data.payments.filter((p) => p.to === props.data.meId && p.canConfirm && p.status !== "failed").length);
</script>
