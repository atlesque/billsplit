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
    :ui="{
      // On phones only the translate icon shows, so the header fits next to the account button.
      base: 'max-sm:size-8 max-sm:justify-center max-sm:p-0',
      leading: 'max-sm:static max-sm:p-0',
      value: 'max-sm:hidden',
      trailing: 'max-sm:hidden',
      content: 'min-w-36',
    }"
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
