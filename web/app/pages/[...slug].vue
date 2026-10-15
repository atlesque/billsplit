<template>
  <ErrorState :error="error" />
</template>

<script setup lang="ts">
const { t } = useI18n();
const error = computed(() => new ApiError(t("error.noPage"), 404));
</script>
