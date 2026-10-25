<template>
  <PageSpinner v-if="pending" />
  <ErrorState v-else-if="error" :error="error" />
  <UCard v-else-if="!groups?.length" class="mx-auto max-w-md">
    <h1 class="mb-3 text-2xl font-bold text-highlighted">{{ $t("groups.firstTitle") }}</h1>
    <ol class="mb-5 list-decimal space-y-1.5 ps-5">
      <li>{{ $t("groups.step1") }}</li>
      <li>{{ $t("groups.step2") }}</li>
      <li>{{ $t("groups.step3") }}</li>
    </ol>
    <UButton to="/new" block size="lg" icon="i-lucide-plus" :label="$t('groups.create')" />
    <p class="mt-4 text-sm text-muted">{{ $t("groups.gotLink") }}</p>
  </UCard>
  <div v-else>
    <div class="mb-4 flex items-center justify-between gap-4">
      <h1 class="text-2xl font-bold text-highlighted">{{ $t("nav.yourGroups") }}</h1>
      <UButton to="/new" icon="i-lucide-plus" :label="$t('groups.new')" />
    </div>
    <template v-for="(section, i) in sections" :key="section.key">
      <button
        v-if="section.key === 'settled'"
        type="button"
        class="mb-2 flex items-center gap-1.5 text-lg font-semibold text-highlighted"
        :class="i > 0 && 'mt-6'"
        :aria-expanded="showSettled"
        @click="settledOpen = !showSettled"
      >
        <UIcon name="i-lucide-chevron-right" class="size-5 text-muted transition-transform" :class="showSettled && 'rotate-90'" />
        {{ $t("groups.settledSection") }}
        <span class="font-normal text-muted">({{ section.groups.length }})</span>
      </button>
      <h2 v-else-if="section.key === 'archived'" class="mt-6 mb-2 text-lg font-semibold text-highlighted">{{ $t("archive.section") }}</h2>
      <UCard v-if="section.key !== 'settled' || showSettled" :ui="{ body: 'p-0 sm:p-0' }">
        <ul class="divide-y divide-default">
          <li v-for="g in section.groups" :key="g.id">
            <!-- Phones put the balance under the group details; wider screens keep it on the right. -->
            <NuxtLink
              :to="`/g/${g.id}`"
              class="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-0.5 px-4 py-3 transition-colors hover:bg-elevated/60 sm:grid-cols-[auto_minmax(0,1fr)_auto]"
            >
              <UAvatar
                :text="initials(g.name)"
                size="lg"
                class="row-span-2 sm:row-span-1"
                :ui="{ root: 'bg-elevated', fallback: 'text-primary font-bold' }"
              />
              <span class="min-w-0">
                <span class="block truncate font-semibold text-highlighted">{{ g.name }}</span>
                <span class="block text-sm text-muted">{{ peopleCount(g.member_count) }} · {{ $t("groups.spent", { amount: money(g.total, g.currency) }) }}</span>
                <span v-if="g.to_confirm" class="block text-sm font-semibold text-primary">{{ $t("groups.toConfirm", g.to_confirm) }}</span>
              </span>
              <span class="col-start-2 text-sm font-semibold tabular-nums sm:col-start-3 sm:row-start-1 sm:text-end sm:whitespace-nowrap" :class="awaiting(g) ? 'text-muted' : tone(g.my_balance)">
                {{
                  g.my_balance === 0
                    ? $t("balance.settled")
                    : $t(g.my_balance > 0 ? "balance.owedAmount" : awaiting(g) ? "balance.awaitingAmount" : "balance.oweAmount", {
                        amount: money(Math.abs(g.my_balance), g.currency),
                      })
                }}
              </span>
            </NuxtLink>
          </li>
        </ul>
      </UCard>
    </template>
  </div>
</template>

<script setup lang="ts">
const api = useApi();
const { money, peopleCount } = useFormat();
const { data: groups, error, pending } = useLoad(() => api<GroupSummary[]>("/groups"));
// You owe money but already sent all of it: only the confirmation is missing.
const awaiting = (g: GroupSummary) => g.my_balance < 0 && g.my_sent >= -g.my_balance;
// Settled groups (nothing owed either way, no payments to confirm) sit in a collapsed list
// below the active ones; archived groups get their own list at the bottom. A group without
// expenses yet stays active.
const isSettled = (g: GroupSummary) => g.my_balance === 0 && !g.to_confirm && g.total > 0;
const sections = computed(() => {
  const open = (groups.value ?? []).filter((g) => !g.archived_at);
  return [
    { key: "active", groups: open.filter((g) => !isSettled(g)) },
    { key: "settled", groups: open.filter(isSettled) },
    { key: "archived", groups: (groups.value ?? []).filter((g) => g.archived_at) },
  ].filter((s) => s.groups.length);
});
// Collapsed by default, unless there's nothing else to show above it.
const settledOpen = ref<boolean | null>(null);
const showSettled = computed(() => settledOpen.value ?? sections.value[0]?.key === "settled");
</script>
