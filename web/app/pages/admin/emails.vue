<template>
  <AdminShell :pending="pending" :error="error">
    <p class="mb-3 text-sm text-muted">{{ $t("admin.emailsHelp") }}</p>
    <UForm :state="filters" class="mb-4 flex flex-wrap items-end gap-3" @submit="apply">
      <UFormField :label="$t('admin.kind')" name="kind" size="sm">
        <USelect v-model="filters.kind" :items="kindItems" size="sm" class="w-44" />
      </UFormField>
      <UFormField :label="$t('admin.to')" name="q" size="sm">
        <UInput v-model="filters.q" :placeholder="$t('admin.userPlaceholder')" size="sm" />
      </UFormField>
      <UButton type="submit" size="sm" color="neutral" variant="outline" :label="$t('admin.filter')" />
    </UForm>
    <UTable :data="rows ?? []" :columns="columns" :empty="$t('admin.noEmails')" class="mb-5 rounded-lg border border-default bg-default">
      <template #time-cell="{ row }"><span class="whitespace-nowrap">{{ formatTime(row.original.created_at) }}</span></template>
      <template #to-cell="{ row }">
        <ULink v-if="row.original.user_id" :to="`/admin/users/${row.original.user_id}`" class="text-primary">{{ row.original.to_email }}</ULink>
        <span v-else>{{ row.original.to_email }}</span>
      </template>
      <template #kind-cell="{ row }"><span class="whitespace-nowrap">{{ kindLabel(row.original.kind) }}</span></template>
      <template #status-cell="{ row }">
        <AdminStatusPill :status="row.original.status" />
        <p v-if="row.original.error" class="neg mt-1 max-w-64 text-xs whitespace-normal">{{ row.original.error }}</p>
      </template>
    </UTable>
  </AdminShell>
</template>

<script setup lang="ts">
const ALL = "all";
const KINDS = ["sign_in", "payment_sent", "payment_received", "payment_reminder"];
const route = useRoute();
const router = useRouter();
const { t, te } = useI18n();
const api = useApi();
const { formatTime } = useFormat();

const query = () => {
  const q = new URLSearchParams();
  if (route.query.kind) q.set("kind", String(route.query.kind));
  if (route.query.q) q.set("q", String(route.query.q));
  return q;
};
const { data: rows, error, pending } = useLoad(() => ["admin/emails", query().toString()], () => api<EmailRow[]>(`/admin/emails?${query()}`));

const filters = reactive({ kind: String(route.query.kind || ALL), q: String(route.query.q ?? "") });
const kindLabel = (kind: string) => (te(`admin.emailKind.${kind}`) ? t(`admin.emailKind.${kind}`) : kind);
const kindItems = computed(() => [{ label: t("admin.all"), value: ALL }, ...KINDS.map((k) => ({ label: kindLabel(k), value: k }))]);
const columns = computed(() => [
  { id: "time", header: t("admin.time") },
  { id: "to", header: t("admin.to") },
  { id: "kind", header: t("admin.kind") },
  { accessorKey: "subject", header: t("admin.subject") },
  { id: "status", header: t("admin.delivery") },
]);

function apply() {
  router.replace({ query: { ...(filters.kind !== ALL && { kind: filters.kind }), ...(filters.q && { q: filters.q }) } });
}
</script>
