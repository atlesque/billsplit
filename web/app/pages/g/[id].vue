<template>
  <PageSpinner v-if="pending" />
  <ErrorState v-else-if="error" :error="error" />
  <div v-else-if="data">
    <BackLink />
    <div class="mb-4 flex items-start justify-between gap-4">
      <div class="min-w-0">
        <h1 class="text-2xl font-bold break-words text-highlighted">{{ group.name }}</h1>
        <p class="text-sm text-muted">
          {{ peopleCount(data.members.length) }} · {{ group.currency }}<template v-if="group.description"> · {{ group.description }}</template>
        </p>
      </div>
      <!-- From two people on, the share link moves from the big card to this button. -->
      <UButton
        v-if="shareButton && group.canManage"
        icon="i-lucide-share-2"
        color="neutral"
        variant="outline"
        size="lg"
        square
        :title="$t('group.share')"
        :aria-label="$t('group.share')"
        @click="shareModal.open({ group, title: $t('link.inviteTitle', { name: group.name }) })"
      />
    </div>

    <div class="mb-4 grid grid-cols-2 gap-3">
      <UCard :ui="{ body: 'p-3 sm:p-4' }">
        <div class="text-xs text-muted">{{ $t("group.totalSpent") }}</div>
        <div class="text-xl font-bold tabular-nums text-highlighted">{{ money(total, group.currency) }}</div>
      </UCard>
      <UCard :ui="{ body: 'p-3 sm:p-4' }">
        <div class="text-xs text-muted">{{ $t(mine.balance >= 0 ? "balance.owed" : "balance.owe") }}</div>
        <div class="text-xl font-bold tabular-nums" :class="mine.balance ? tone(mine.balance) : 'text-highlighted'">{{ money(Math.abs(mine.balance), group.currency) }}</div>
      </UCard>
    </div>

    <!-- While you're the only person in the group, the share link is the main call to action. -->
    <GroupLinkCard v-if="!shareButton && tab !== 'people' && group.canManage" :group="group" />

    <!-- An underlined tab bar, so the tabs read as navigation and the only filled primary button is Add expense. -->
    <UTabs
      v-model="tab"
      :items="tabs"
      :content="false"
      variant="link"
      size="lg"
      class="mb-5"
      :ui="{ list: 'border-accented', trigger: 'grow px-1.5 pb-2.5 sm:px-3', leadingIcon: 'hidden sm:inline-flex' }"
      :aria-label="$t('group.sections')"
    />

    <GroupExpensesTab v-if="tab === 'expenses'" :data="data" @add="openExpense(null)" @open="openExpense" />
    <GroupBalancesTab v-else-if="tab === 'balances'" :data="data" @changed="refresh" />
    <GroupPeopleTab v-else-if="tab === 'people'" :data="data" @changed="refresh" />
    <GroupSettingsTab v-else :data="data" @changed="refresh" />
  </div>
</template>

<script setup lang="ts">
import { ExpenseModal, ShareModal } from "#components";

const TABS = ["expenses", "balances", "people", "settings"] as const;
const TAB_ICONS = { expenses: "i-lucide-receipt", balances: "i-lucide-scale", people: "i-lucide-users", settings: "i-lucide-settings" } as const;
type Tab = (typeof TABS)[number];

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const api = useApi();
const { money, peopleCount } = useFormat();
const overlay = useOverlay();
const shareModal = overlay.create(ShareModal);
const expenseModal = overlay.create(ExpenseModal);

const id = computed(() => String(route.params.id));
const { data, error, pending, refresh } = useLoad(() => api<GroupData>(`/groups/${id.value}`), id);

const group = computed(() => data.value!.group);
const mine = computed(() => data.value!.members.find((m) => m.id === data.value!.meId)!);
const total = computed(() => data.value!.expenses.filter((e) => e.kind === "expense").reduce((a, e) => a + e.amount, 0));
const shareButton = computed(() => data.value!.members.length >= 2);

const tab = computed<Tab>({
  get: () => (TABS.includes(route.query.tab as Tab) ? (route.query.tab as Tab) : "expenses"),
  set: (value) => router.push({ query: value === "expenses" ? {} : { tab: value } }),
});
// Payments waiting for you to confirm show as a count on the Balances tab.
const toConfirm = computed(() => data.value?.payments.filter((p) => p.canConfirm && p.status === "sent").length ?? 0);
const tabs = computed(() =>
  TABS.map((key) => ({
    label: t(`tab.${key}`),
    value: key,
    icon: TAB_ICONS[key],
    badge: key === "balances" && toConfirm.value ? { label: String(toConfirm.value), color: "neutral" as const, variant: "solid" as const, size: "sm" as const } : undefined,
  })),
);

// Right after creating a group, show its share link.
watch(data, (value) => {
  if (value && route.query.share === "1") {
    router.replace({ query: {} });
    shareModal.open({ group: value.group });
  }
});

async function openExpense(expense: Expense | null, fromTemplate = false) {
  const changed = await expenseModal.open({ data: data.value!, expense, fromTemplate }).result;
  if (changed) refresh();
}
</script>
