<template>
  <AdminShell :pending="pending" :error="error">
    <div v-if="d">
      <h2 class="text-xl font-semibold text-highlighted">{{ d.group.name }}</h2>
      <p class="mb-4 text-muted">
        {{ d.group.currency }} · {{ $t("admin.createdBy", { time: formatTime(d.group.created_at) }) }}
        <ULink v-if="d.group.owner_id" :to="`/admin/users/${d.group.owner_id}`" class="text-primary">{{ d.group.owner_email }}</ULink>
        <span v-else>—</span>
      </p>
      <h3 class="mb-2 font-semibold text-highlighted">{{ $t("admin.people") }}</h3>
      <UTable :data="d.people" :columns="peopleColumns" class="mb-5 rounded-lg border border-default bg-default">
        <template #account-cell="{ row }">
          <ULink v-if="row.original.user_id" :to="`/admin/users/${row.original.user_id}`" class="text-primary">{{ row.original.email }}</ULink>
          <UBadge v-else color="neutral" variant="subtle" size="sm" :label="$t('admin.notJoined')" />
        </template>
        <template #last-cell="{ row }"><span class="whitespace-nowrap">{{ formatTime(row.original.last_login_at) }}</span></template>
        <template #balance-cell="{ row }"><span class="whitespace-nowrap">{{ money(row.original.balance, d.group.currency) }}</span></template>
        <template #added-cell="{ row }"><span class="whitespace-nowrap">{{ formatTime(row.original.created_at) }}</span></template>
      </UTable>
      <h3 class="mb-2 font-semibold text-highlighted">{{ $t("admin.invites") }}</h3>
      <UTable :data="d.invites" :columns="inviteColumns" :empty="$t('admin.noInvites')" class="mb-5 rounded-lg border border-default bg-default">
        <template #link-cell="{ row }">
          {{ row.original.multi_use ? $t("link.groupLink") : row.original.label ? $t("admin.personalLabel", { label: row.original.label }) : $t("admin.personal") }}
        </template>
        <template #status-cell="{ row }"><AdminStatusPill :status="row.original.status" /></template>
        <template #created-cell="{ row }"><span class="whitespace-nowrap">{{ formatTime(row.original.created_at) }}</span></template>
        <template #by-cell="{ row }">{{ row.original.created_by_email ?? "—" }}</template>
        <template #used-cell="{ row }">
          <template v-if="row.original.used_by_email">
            {{ row.original.used_by_email }} <span class="text-xs text-muted">{{ formatTime(row.original.used_at) }}</span>
          </template>
          <span v-else class="whitespace-nowrap">{{ formatTime(row.original.last_used_at) }}</span>
        </template>
      </UTable>
      <h3 class="mb-2 font-semibold text-highlighted">{{ $t("admin.activity") }}</h3>
      <AdminAuditTable :entries="d.audit" :show-group="false" />
    </div>
  </AdminShell>
</template>

<script setup lang="ts">
const route = useRoute();
const { t } = useI18n();
const api = useApi();
const { money, formatTime } = useFormat();
const id = computed(() => String(route.params.id));
const { data: d, error, pending } = useLoad(() => api<{ group: AdminRow; people: AdminRow[]; invites: AdminRow[]; audit: AuditEntry[] }>(`/admin/groups/${id.value}`), id);
const peopleColumns = computed(() => [
  { accessorKey: "name", header: t("admin.name") },
  { id: "account", header: t("admin.account") },
  { id: "last", header: t("admin.lastSignin") },
  { id: "balance", header: t("admin.balance") },
  { id: "added", header: t("admin.added") },
]);
const inviteColumns = computed(() => [
  { id: "link", header: t("admin.link") },
  { id: "status", header: t("admin.status") },
  { accessorKey: "use_count", header: t("admin.joins") },
  { id: "created", header: t("admin.created") },
  { id: "by", header: t("admin.by") },
  { id: "used", header: t("admin.lastUsed") },
]);
</script>
