<template>
  <div>
    <h1 class="mb-3 text-2xl font-bold text-highlighted">{{ $t("admin.title") }}</h1>
    <UNavigationMenu :items="items" highlight class="mb-4 overflow-x-auto border-b border-default" :aria-label="$t('admin.sections')" />
    <PageSpinner v-if="pending" />
    <ErrorState v-else-if="error" :error="error" />
    <slot v-else />
  </div>
</template>

<script setup lang="ts">
defineProps<{ pending?: boolean; error?: unknown }>();
const { t } = useI18n();
const items = computed(() => [
  { label: t("admin.overview"), to: "/admin", exact: true },
  { label: t("admin.users"), to: "/admin/users" },
  { label: t("admin.groups"), to: "/admin/groups" },
  { label: t("admin.signins"), to: "/admin/signins" },
  { label: t("admin.audit"), to: "/admin/audit" },
]);
</script>
