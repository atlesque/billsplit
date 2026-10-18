<template>
  <!-- Staging only: the Worker refuses these endpoints everywhere else. -->
  <UCard class="mx-auto max-w-md">
    <UForm :state="state" class="space-y-4" @submit="signIn">
      <div>
        <div class="flex items-center gap-2">
          <h1 class="text-2xl font-bold text-highlighted">{{ $t("testLogin.title") }}</h1>
          <UBadge :label="$t('testLogin.staging')" color="warning" variant="subtle" />
        </div>
        <p class="mt-1 text-muted">{{ $t("testLogin.help") }}</p>
      </div>
      <PageSpinner v-if="loading" />
      <template v-else>
        <UFormField :label="$t('testLogin.user')" name="userId">
          <USelectMenu
            v-model="state.userId"
            :items="items"
            value-key="value"
            :search-input="{ placeholder: $t('testLogin.search') }"
            :placeholder="$t('testLogin.pick')"
            size="lg"
            class="w-full"
          />
        </UFormField>
        <p v-if="error" class="text-sm text-error">{{ error }}</p>
        <UButton type="submit" block size="lg" :label="$t('signin.submit')" :loading="busy" :disabled="!state.userId" />
      </template>
    </UForm>
  </UCard>
</template>

<script setup lang="ts">
const { t } = useI18n();
const route = useRoute();
const api = useApi();
const { me, signedIn } = useSession();

const users = ref<{ id: string; email: string; name: string }[]>([]);
const state = reactive({ userId: me.value?.id as string | undefined });
const loading = ref(true);
const busy = ref(false);
const error = ref("");

const items = computed(() =>
  users.value.map((u) => ({ value: u.id, label: u.name || u.email, description: u.name ? u.email : t("testLogin.noName") })),
);

onMounted(async () => {
  try {
    users.value = (await api<{ users: typeof users.value }>("/auth/test-users")).users;
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    loading.value = false;
  }
});

async function signIn() {
  if (!state.userId) return;
  busy.value = true;
  error.value = "";
  try {
    const res = await api("/auth/test-user", { method: "POST", body: { userId: state.userId, next: route.query.next } });
    signedIn(res);
    await navigateTo(res.next && res.next !== "/test-login" ? res.next : "/", { replace: true });
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    busy.value = false;
  }
}
</script>
