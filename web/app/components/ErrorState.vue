<template>
  <!-- Admin pages sit behind Cloudflare Access. Without an Access session the API call is
       redirected to the Access login (a network error for fetch); a full page load signs in. -->
  <UCard v-if="accessNeeded" class="mx-auto max-w-md text-center">
    <h2 class="text-lg font-semibold text-highlighted">{{ $t("admin.confirmTitle") }}</h2>
    <p class="mt-1 mb-4 text-muted">{{ $t("admin.confirmHelp") }}</p>
    <UButton :label="$t('action.continue')" @click="reload" />
  </UCard>
  <UCard v-else class="py-6 text-center">
    <h2 class="text-lg font-semibold text-highlighted">{{ $t(status === 404 ? "error.notFound" : "error.generic") }}</h2>
    <p class="mt-1 mb-4 text-muted">{{ message }}</p>
    <UButton to="/" color="neutral" variant="outline" :label="$t('nav.toGroups')" />
  </UCard>
</template>

<script setup lang="ts">
const props = defineProps<{ error: unknown }>();
const route = useRoute();
const { signedOut } = useSession();

const status = computed(() => (props.error instanceof ApiError ? props.error.status : 0));
const message = computed(() => (props.error instanceof Error ? props.error.message : String(props.error)));
const accessNeeded = computed(() => route.path.startsWith("/admin") && (props.error instanceof TypeError || status.value === 403));
const reload = () => window.location.assign(route.fullPath);

// A 401 means the session ended: show the sign-in form for this page.
watchEffect(() => {
  if (status.value === 401) signedOut();
});
</script>
