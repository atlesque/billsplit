<template>
  <AdminShell :pending="pending" :error="error">
    <UTable v-if="users" :data="users" :columns="columns" class="rounded-lg border border-default bg-default">
      <template #email-cell="{ row }"><ULink :to="`/admin/users/${row.original.id}`" class="text-primary">{{ row.original.email }}</ULink></template>
      <template #name-cell="{ row }">{{ row.original.name || "—" }}</template>
      <template #registered-cell="{ row }"><span class="whitespace-nowrap">{{ formatTime(row.original.created_at) }}</span></template>
      <template #last-cell="{ row }"><span class="whitespace-nowrap">{{ formatTime(row.original.last_login_at) }}</span></template>
      <template #groups-cell="{ row }">
        {{ row.original.groups }}
        <span v-if="row.original.owned_groups" class="text-xs text-muted">{{ $t("admin.owned", { count: row.original.owned_groups }) }}</span>
      </template>
    </UTable>
  </AdminShell>
</template>

<script setup lang="ts">
const { t } = useI18n();
const api = useApi();
const { formatTime } = useFormat();
const { data: users, error, pending } = useLoad("admin/users", () => api<AdminRow[]>("/admin/users"));
const columns = computed(() => [
  { id: "email", header: t("admin.email") },
  { id: "name", header: t("admin.name") },
  { id: "registered", header: t("admin.registered") },
  { id: "last", header: t("admin.lastSignin") },
  { id: "groups", header: t("admin.groups") },
  { accessorKey: "sessions", header: t("admin.sessions") },
]);
</script>
