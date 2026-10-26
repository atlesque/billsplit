<template>
  <AdminShell :pending="pending" :error="error">
    <p class="mb-3 text-sm text-muted">{{ $t("admin.signinsHelp") }}</p>
    <AdminSignInsTable v-if="rows" :rows="rows" />
  </AdminShell>
</template>

<script setup lang="ts">
const api = useApi();
const { data: rows, error, pending } = useLoad("admin/signins", () => api<SignInRow[]>("/admin/signins"));
</script>
