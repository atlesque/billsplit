<template>
  <UTable :data="entries" :columns="columns" :empty="$t('admin.noEntries')" class="mb-5 rounded-lg border border-default bg-default">
    <template #at-cell="{ row }"><span class="whitespace-nowrap">{{ formatTime(row.original.at) }}</span></template>
    <template #action-cell="{ row }"><span :title="row.original.action">{{ actionLabel(row.original.action) }}</span></template>
    <template #actor-cell="{ row }">
      <ULink v-if="row.original.actor_id" :to="`/admin/users/${row.original.actor_id}`" class="text-primary">{{ row.original.actor_email }}</ULink>
      <span v-else class="text-muted">{{ details(row.original).email ?? "—" }}</span>
    </template>
    <template #group-cell="{ row }">
      <ULink v-if="row.original.group_id" :to="`/admin/groups/${row.original.group_id}`" class="text-primary">{{ row.original.group_name ?? $t("admin.deleted") }}</ULink>
      <span v-else>—</span>
    </template>
    <template #details-cell="{ row }">
      <code class="text-xs break-words whitespace-normal text-muted">{{ Object.keys(details(row.original)).length ? row.original.details : "" }}</code>
      <span v-if="row.original.ip" class="text-xs text-muted"> · {{ row.original.ip }}</span>
    </template>
  </UTable>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{ entries: AuditEntry[]; showGroup?: boolean }>(), { showGroup: true });
const { t, te } = useI18n();
const { formatTime } = useFormat();
const details = (a: AuditEntry): Record<string, unknown> => JSON.parse(a.details || "{}");
const actionLabel = (action: string) => (te(`audit.${action}`) ? t(`audit.${action}`) : action);
const columns = computed(() => [
  { id: "at", header: t("admin.time") },
  { id: "action", header: t("admin.action") },
  { id: "actor", header: t("admin.by") },
  ...(props.showGroup ? [{ id: "group", header: t("admin.group") }] : []),
  { id: "details", header: t("admin.details") },
]);
</script>
