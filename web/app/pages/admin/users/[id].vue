<template>
  <AdminShell :pending="pending" :error="error">
    <div v-if="d">
      <h2 class="text-xl font-semibold text-highlighted">{{ d.user.email }}</h2>
      <p class="mb-4 text-muted">
        {{ $t("admin.userMeta", { name: d.user.name || $t("admin.noName"), registered: formatTime(d.user.created_at), lastSignin: formatTime(d.user.last_login_at) }) }}
      </p>
      <h3 class="mb-2 font-semibold text-highlighted">{{ $t("admin.groups") }}</h3>
      <UTable :data="d.groups" :columns="groupColumns" :empty="$t('admin.noGroups')" class="mb-5 rounded-lg border border-default bg-default">
        <template #group-cell="{ row }"><ULink :to="`/admin/groups/${row.original.id}`" class="text-primary">{{ row.original.name }}</ULink></template>
        <template #role-cell="{ row }">{{ $t(row.original.is_owner ? "admin.owner" : "admin.member") }}</template>
        <template #created-cell="{ row }"><span class="whitespace-nowrap">{{ formatTime(row.original.created_at) }}</span></template>
      </UTable>
      <h3 class="mb-2 font-semibold text-highlighted">{{ $t("admin.signinsTitle") }}</h3>
      <AdminSignInsTable :rows="d.signins" :show-email="false" />
      <h3 class="mb-2 font-semibold text-highlighted">{{ $t("admin.activity") }}</h3>
      <AdminAuditTable :entries="d.audit" />
    </div>
  </AdminShell>
</template>

<script setup lang="ts">
const route = useRoute();
const { t } = useI18n();
const api = useApi();
const { formatTime } = useFormat();
const id = computed(() => String(route.params.id));
const { data: d, error, pending } = useLoad(() => ["admin/user", id.value], () => api<{ user: AdminRow; groups: AdminRow[]; signins: SignInRow[]; audit: AuditEntry[] }>(`/admin/users/${id.value}`));
const groupColumns = computed(() => [
  { id: "group", header: t("admin.group") },
  { accessorKey: "member_name", header: t("admin.as") },
  { id: "role", header: t("admin.role") },
  { id: "created", header: t("admin.created") },
]);
</script>
