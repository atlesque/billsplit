<template>
  <AdminShell :pending="pending" :error="error">
    <div v-if="o" class="grid grid-cols-2 gap-3 md:grid-cols-3">
      <UCard v-for="tile in tiles" :key="tile.label" :ui="{ body: 'p-3 sm:p-4' }">
        <div class="text-xs text-muted">{{ tile.label }}</div>
        <div class="text-2xl font-bold tabular-nums text-highlighted">{{ tile.value }}</div>
        <div class="text-sm" :class="tile.bad ? 'neg' : 'text-muted'">{{ tile.sub }}</div>
      </UCard>
    </div>
  </AdminShell>
</template>

<script setup lang="ts">
const { t } = useI18n();
const api = useApi();
const { data: o, error, pending } = useLoad(() => api<Record<string, number>>("/admin/overview"));
const tiles = computed(() => {
  const v = o.value!;
  return [
    { label: t("admin.users"), value: v.users, sub: t("admin.usersSub", { new: v.users_7d, active: v.active_7d }) },
    { label: t("admin.groups"), value: v.groups, sub: t("admin.expensesCount", { count: v.expenses }) },
    { label: t("admin.peopleInGroups"), value: v.people, sub: t("admin.withAccount", { count: v.joined_people }) },
    { label: t("admin.linkJoins"), value: v.link_joins, sub: t("admin.activeLinks", { count: v.open_invites }) },
    { label: t("admin.signins24h"), value: v.signins_24h, sub: t("admin.verifiedCount", { count: v.signins_verified_24h }) },
    { label: t("admin.emails24h"), value: v.emails_24h, sub: t("admin.failedCount", { count: v.emails_failed_24h }), bad: Boolean(v.emails_failed_24h) },
  ];
});
</script>
