<template>
  <div>
    <section class="pt-6 pb-4 text-center">
      <h1 class="font-display text-5xl leading-tight tracking-tight text-highlighted">BillSplit<span class="text-secondary">.</span></h1>
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
