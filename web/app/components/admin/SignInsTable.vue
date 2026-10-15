<template>
  <UTable :data="rows" :columns="columns" :empty="$t('admin.noSignins')" class="mb-5 rounded-lg border border-default bg-default">
    <template #created-cell="{ row }"><span class="whitespace-nowrap">{{ formatTime(row.original.created_at) }}</span></template>
    <template #email-cell="{ row }">
      <ULink v-if="row.original.user_id" :to="`/admin/users/${row.original.user_id}`" class="text-primary">{{ row.original.email }}</ULink>
      <span v-else>{{ row.original.email }}</span>
      <UBadge v-if="row.original.registered" color="success" variant="subtle" size="sm" class="ms-1" :label="$t('admin.newAccount')" />
    </template>
    <template #status-cell="{ row }">
      <AdminStatusPill :status="row.original.status" />
      <span v-if="row.original.used_at" class="ms-1 text-xs text-muted">{{ formatTime(row.original.used_at) }}</span>
    </template>
    <template #delivery-cell="{ row }">
      <AdminStatusPill :status="row.original.email_status" />
      <span v-if="row.original.email_error" class="neg ms-1 text-xs">{{ row.original.email_error }}</span>
    </template>
    <template #next-cell="{ row }"><code class="text-xs">{{ row.original.next_path }}</code></template>
  </UTable>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{ rows: SignInRow[]; showEmail?: boolean }>(), { showEmail: true });
const { t } = useI18n();
const { formatTime } = useFormat();
const columns = computed(() => [
  { id: "created", header: t("admin.requested") },
  ...(props.showEmail ? [{ id: "email", header: t("admin.email") }] : []),
  { id: "status", header: t("admin.verification") },
  { id: "delivery", header: t("admin.delivery") },
  { accessorKey: "attempts", header: t("admin.wrongCodes") },
  { id: "next", header: t("admin.wentTo") },
]);
</script>
