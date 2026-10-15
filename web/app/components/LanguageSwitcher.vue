<template>
  <USelect
    v-model="current"
    :items="items"
    size="sm"
    variant="ghost"
    icon="i-lucide-languages"
    :aria-label="$t('lang.label')"
    :title="$t('lang.label')"
    class="w-auto"
    :ui="{ content: 'min-w-36' }"
  />
</template>

<script setup lang="ts">
const { locale, locales, setLocale } = useI18n();
const items = computed(() => locales.value.map((l) => ({ label: l.name ?? l.code, value: l.code })));
const current = computed({
  get: () => locale.value,
  set: (value) => setLocale(value as typeof locale.value),
});
</script>
