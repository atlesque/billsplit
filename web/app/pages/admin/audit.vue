<template>
  <AdminShell :pending="pending" :error="error">
    <UForm :state="filters" class="mb-4 flex flex-wrap items-end gap-3" @submit="apply">
      <UFormField :label="$t('admin.action')" name="action" size="sm">
        <USelect v-model="filters.action" :items="actionItems" size="sm" class="w-36" />
      </UFormField>
      <UFormField :label="$t('admin.user')" name="actor" size="sm">
        <UInput v-model="filters.actor" :placeholder="$t('admin.userPlaceholder')" size="sm" />
      </UFormField>
      <UButton type="submit" size="sm" color="neutral" variant="outline" :label="$t('admin.filter')" />
    </UForm>
    <AdminAuditTable :entries="entries" />
    <div v-if="next" class="flex justify-center">
      <UButton color="neutral" variant="outline" :label="$t('admin.loadMore')" :loading="loadingMore" @click="more" />
    </div>
  </AdminShell>
</template>

<script setup lang="ts">
const ALL = "all";
const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const api = useApi();

const filters = reactive({ action: ALL, actor: "" });
const entries = ref<AuditEntry[]>([]);
const next = ref<string | null>(null);
const loadingMore = ref(false);
const actionItems = computed(() => [
  { label: t("admin.all"), value: ALL },
  ...["auth", "user", "group", "member", "invite", "expense"].map((p) => ({ label: p, value: `${p}.` })),
]);

const query = () => {
  const q = new URLSearchParams();
  if (route.query.action) q.set("action", String(route.query.action));
  if (route.query.actor) q.set("actor", String(route.query.actor));
  return q;
};

// Not refetched in the background: that would drop the pages added with "Load more".
const { data: first, error, pending } = useLoad(
  () => ["admin/audit", query().toString()],
  () => api<{ entries: AuditEntry[]; next: string | null }>(`/admin/audit?${query()}`),
  { live: false },
);
watch(
  first,
  (page) => {
    filters.action = String(route.query.action || ALL);
    filters.actor = String(route.query.actor ?? "");
    entries.value = page?.entries ?? [];
    next.value = page?.next ?? null;
  },
  { immediate: true },
);

function apply() {
  router.replace({ query: { ...(filters.action !== ALL && { action: filters.action }), ...(filters.actor && { actor: filters.actor }) } });
}

async function more() {
  loadingMore.value = true;
  try {
    const q = query();
    q.set("before", next.value!);
    const page = await api<{ entries: AuditEntry[]; next: string | null }>(`/admin/audit?${q}`);
    entries.value = entries.value.concat(page.entries);
    next.value = page.next;
  } finally {
    loadingMore.value = false;
  }
}
</script>
