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
        v-if="shareButton && group.canManage && !group.archived_at"
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

    <UAlert v-if="group.archived_at" class="mb-4" color="neutral" variant="subtle" icon="i-lucide-archive" :title="$t('archive.banner')">
      <template #description>
        {{ $t(group.attachments_removed_at ? "archive.attachmentsRemoved" : "archive.attachmentsKept") }}
      </template>
      <template v-if="group.canManage" #actions>
        <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-archive-restore" :label="$t('archive.reopen')" :loading="reopening" @click="reopen" />
      </template>
    </UAlert>

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

    <!-- Paying what you owe, or confirming what you're owed, starts from your own overview. Outlined: filled primary is for Add expense. -->
    <UButton
      v-if="mine.balance || myPaymentsToConfirm"
      block
      size="lg"
      color="neutral"
      variant="outline"
      :icon="mine.balance < 0 ? 'i-lucide-hand-coins' : 'i-lucide-circle-check'"
      trailing-icon="i-lucide-chevron-right"
      class="mb-4 justify-start"
      :ui="{ trailingIcon: 'ms-auto' }"
      :label="$t(mine.balance < 0 ? 'person.ctaOwe' : 'person.ctaOwed')"
      @click="openPerson(mine.id)"
    >
      <template v-if="myPaymentsToConfirm" #trailing>
        <UBadge color="neutral" variant="solid" size="sm" class="ms-auto" :label="String(myPaymentsToConfirm)" />
        <UIcon name="i-lucide-chevron-right" class="size-5 shrink-0" />
      </template>
    </UButton>

    <!-- While you're the only person in the group, the share link is the main call to action. -->
    <GroupLinkCard v-if="!shareButton && tab !== 'people' && group.canManage && !group.archived_at" :group="group" />

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
    <GroupBalancesTab v-else-if="tab === 'balances'" :data="data" @changed="refresh" @person="openPerson" />
    <GroupPeopleTab v-else-if="tab === 'people'" :data="data" @changed="refresh" />
    <GroupSettingsTab v-else :data="data" @changed="refresh" />
  </div>
</template>

<script setup lang="ts">
import { ExpenseModal, PersonModal, ShareModal } from "#components";

const TABS = ["expenses", "balances", "people", "settings"] as const;
const TAB_ICONS = { expenses: "i-lucide-receipt", balances: "i-lucide-scale", people: "i-lucide-users", settings: "i-lucide-settings" } as const;
type Tab = (typeof TABS)[number];

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const api = useApi();
const toast = useToast();
const { money, peopleCount } = useFormat();
const overlay = useOverlay();
const shareModal = overlay.create(ShareModal);
const expenseModal = overlay.create(ExpenseModal);
const personModal = overlay.create(PersonModal);

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

const myPaymentsToConfirm = computed(() => data.value?.payments.filter((p) => p.to === data.value!.meId && p.canConfirm && p.status !== "failed").length ?? 0);

function openPerson(memberId: string) {
  personModal.open({ data: data.value!, memberId, onChanged: refresh });
}
// Keep an open overview in step with the group after a payment or an edit.
watch(data, (value) => {
  if (value) personModal.patch({ data: value });
});

// Right after creating a group, show its share link.
watch(data, (value) => {
  if (value && route.query.share === "1") {
    router.replace({ query: {} });
    shareModal.open({ group: value.group });
  }
});

async function openExpense(expense: Expense | null, fromTemplate = false) {
  const changed = await expenseModal.open({ data: data.value!, expense, fromTemplate }).result;
  // Closed some other way than its buttons (Escape, the X): attachments may still have changed.
  if (changed !== false) refresh();
}

const reopening = ref(false);
async function reopen() {
  reopening.value = true;
  try {
    await api(`/groups/${id.value}/archive`, { method: "DELETE" });
    toast.add({ title: t("archive.reopened"), color: "success" });
    await refresh();
  } catch (err) {
    toast.add({ title: (err as Error).message, color: "error" });
  } finally {
    reopening.value = false;
  }
}
</script>
