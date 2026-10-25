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
// Browser chrome follows the page background (--app-bg in main.css). Same name as the static
// tag in nuxt.config.ts, so it replaces that tag instead of adding a second one.
const colorMode = useColorMode();
const themeColor = computed(() => (colorMode.value === "dark" ? "#0d131c" : "#f6f7f9"));
useHead({ htmlAttrs: { lang: locale }, meta: [{ name: "theme-color", content: themeColor }] });
</script>
