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
      <div class="flex shrink-0 gap-2">
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
        <!-- Settings are seldom needed, so they sit behind a cogwheel instead of a tab. Read-only for everyone but the owner. -->
        <UButton
          icon="i-lucide-settings"
          color="neutral"
          variant="outline"
          size="lg"
          square
          :title="$t('tab.settings')"
          :aria-label="$t('tab.settings')"
          @click="openSettings"
        />
      </div>
    </div>

    <UAlert v-if="group.archived_at" class="mb-4" color="neutral" variant="subtle" icon="i-lucide-archive" :title="$t('archive.banner')">
      <template #description>
        {{ $t(group.attachments_removed_at ? "archive.attachmentsRemoved" : "archive.attachmentsKept") }}
      </template>
      <template v-if="group.canManage" #actions>
        <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-archive-restore" :label="$t('archive.reopen')" :loading="reopening" @click="reopen" />
      </template>
    </UAlert>

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

    <GroupOverviewTab v-if="tab === 'overview'" :data="data" @person="openPerson" @expenses="tab = 'expenses'" @add="openExpense(null)" />
    <GroupExpensesTab
      v-else-if="tab === 'expenses'"
      :data="data"
      :person="personFilter"
      @add="openExpense(null)"
      @open="openExpense"
      @clear-person="router.replace({ query: { tab: 'expenses' } })"
    />
    <GroupBalancesTab v-else-if="tab === 'balances'" :data="data" @changed="refresh" @person="openPerson" />
    <GroupPeopleTab v-else :data="data" @changed="refresh" />
  </div>
</template>

<script setup lang="ts">
import { ExpenseModal, PersonModal, SettingsModal, ShareModal } from "#components";

const TABS = ["overview", "expenses", "balances", "people"] as const;
const TAB_ICONS = { overview: "i-lucide-layout-dashboard", expenses: "i-lucide-receipt", balances: "i-lucide-scale", people: "i-lucide-users" } as const;
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
const settingsModal = overlay.create(SettingsModal);

const id = computed(() => String(route.params.id));
const { data, error, pending, refresh } = useLoad(() => ["group", id.value], () => api<GroupData>(`/groups/${id.value}`));

const group = computed(() => data.value!.group);
const mine = computed(() => data.value!.members.find((m) => m.id === data.value!.meId)!);
const shareButton = computed(() => data.value!.members.length >= 2);

const tab = computed<Tab>({
  get: () => (TABS.includes(route.query.tab as Tab) ? (route.query.tab as Tab) : "overview"),
  set: (value) => router.push({ query: value === "overview" ? {} : { tab: value } }),
});
// Payments waiting for you to confirm show as a count on the Overview tab, where you confirm them.
const toConfirm = computed(() => data.value?.payments.filter((p) => p.to === data.value!.meId && p.canConfirm && p.status !== "failed").length ?? 0);
const tabs = computed(() =>
  TABS.map((key) => ({
    label: t(`tab.${key}`),
    value: key,
    icon: TAB_ICONS[key],
    badge: key === "overview" && toConfirm.value ? { label: String(toConfirm.value), color: "neutral" as const, variant: "solid" as const, size: "sm" as const } : undefined,
  })),
);

// ?person=<id> narrows the Expenses tab to one person's expenses, from their balance overview.
const personFilter = computed(() => (typeof route.query.person === "string" ? route.query.person : undefined));

function openPerson(memberId: string) {
  personModal.open({ data: data.value!, memberId, onChanged: refresh });
}
// Keep an open overview in step with the group after a payment or an edit.
watch(data, (value) => {
  if (value) personModal.patch({ data: value });
});

function openSettings() {
  settingsModal.open({ data: data.value!, onChanged: refresh });
}
watch(data, (value) => {
  if (value) settingsModal.patch({ data: value });
});

watch(data, (value) => {
  if (!value) return;
  // Right after creating a group, show its share link.
  if (route.query.share === "1") {
    router.replace({ query: {} });
    shareModal.open({ group: value.group });
  }
  // Settings used to be a tab: old ?tab=settings links open them over the overview.
  if (route.query.tab === "settings") {
    router.replace({ query: {} });
    openSettings();
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
