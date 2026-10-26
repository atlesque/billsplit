<template>
  <AdminShell :pending="pending" :error="error">
    <UTable v-if="groups" :data="groups" :columns="columns" class="rounded-lg border border-default bg-default">
      <template #group-cell="{ row }"><ULink :to="`/admin/groups/${row.original.id}`" class="text-primary">{{ row.original.name }}</ULink></template>
      <template #owner-cell="{ row }">{{ row.original.owner_email ?? "—" }}</template>
      <template #people-cell="{ row }">{{ $t("admin.joinedOf", { joined: row.original.joined, people: row.original.people }) }}</template>
      <template #total-cell="{ row }"><span class="whitespace-nowrap">{{ money(row.original.total, row.original.currency) }}</span></template>
      <template #created-cell="{ row }"><span class="whitespace-nowrap">{{ formatTime(row.original.created_at) }}</span></template>
    </UTable>
  </AdminShell>
</template>

<script setup lang="ts">
const { t } = useI18n();
const api = useApi();
const { money, formatTime } = useFormat();
const { data: groups, error, pending } = useLoad("admin/groups", () => api<AdminRow[]>("/admin/groups"));
const columns = computed(() => [
  { id: "group", header: t("admin.group") },
  { id: "owner", header: t("admin.owner") },
  { id: "people", header: t("admin.people") },
  { accessorKey: "expenses", header: t("admin.expenses") },
  { id: "total", header: t("admin.total") },
  { accessorKey: "open_invites", header: t("admin.openInvites") },
  { id: "created", header: t("admin.created") },
]);
</script>
