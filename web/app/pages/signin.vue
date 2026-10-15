<template>
  <!-- A button rather than signing in on page load, so email link scanners can't use up the link. -->
  <UCard class="mx-auto max-w-md text-center">
    <h1 class="text-2xl font-bold text-highlighted">{{ $t("signin.submit") }}</h1>
    <p class="mt-1 mb-4 text-muted">{{ $t("signin.linkHelp") }}</p>
    <p v-if="error" class="mb-3 text-sm text-error">{{ error }}</p>
    <UButton block size="lg" :label="$t('signin.finish')" :loading="busy" autofocus @click="finish" />
    <UButton to="/" variant="link" size="sm" class="mt-3" :label="$t('signin.newLink')" />
  </UCard>
</template>

<script setup lang="ts">
const route = useRoute();
const api = useApi();
const { signedIn } = useSession();
const error = ref("");
const busy = ref(false);

async function finish() {
  busy.value = true;
  error.value = "";
  try {
    const res = await api("/auth/link", { method: "POST", body: { token: route.query.token } });
    signedIn(res);
    await navigateTo(res.next && res.next !== "/signin" ? res.next : "/", { replace: true });
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    busy.value = false;
  }
}
</script>
