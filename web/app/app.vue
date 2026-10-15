<template>
  <UApp :toaster="{ position: 'bottom-center', duration: 2600 }" :locale="uiLocale">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>

<script setup lang="ts">
import { en, nl } from "@nuxt/ui/locale";

const { locale } = useI18n();
const uiLocale = computed(() => (locale.value === "nl" ? nl : en));
useHead({ htmlAttrs: { lang: locale } });
</script>
