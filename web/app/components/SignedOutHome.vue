<template>
  <div>
    <section class="pt-6 pb-4 text-center">
      <h1 class="text-3xl font-bold text-highlighted">BillSplit</h1>
      <p class="mt-1 text-muted">{{ $t("app.tagline") }}</p>
    </section>
    <UCard class="mx-auto max-w-md">
      <SignInForm :next="next" />
    </UCard>
  </div>
</template>

<script setup lang="ts">
const route = useRoute();
// Where to land after signing in, on any device.
const next = computed(() => (route.path === "/" ? "/" : route.fullPath));
</script>
