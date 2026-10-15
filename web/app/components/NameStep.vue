<template>
  <UCard class="mx-auto max-w-md">
    <p class="mb-1 text-xs font-bold tracking-wider text-primary uppercase">{{ $t("name.created") }}</p>
    <h1 class="text-2xl font-bold text-highlighted">{{ $t("name.title") }}</h1>
    <p class="mt-1 mb-4 text-sm text-muted">{{ $t("name.help") }}</p>
    <UForm :state="state" class="space-y-4" @submit="save">
      <UFormField :label="$t('account.yourName')" name="name" :error="error || undefined">
        <UInput v-model="state.name" maxlength="60" autocomplete="name" required autofocus class="w-full" />
      </UFormField>
      <UButton type="submit" block :label="$t('action.continue')" :loading="busy" />
    </UForm>
  </UCard>
</template>

<script setup lang="ts">
const api = useApi();
const { me } = useSession();
const state = reactive({ name: "" });
const error = ref("");
const busy = ref(false);

async function save() {
  busy.value = true;
  try {
    me.value = await api<User>("/me", { method: "PATCH", body: { name: state.name } });
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    busy.value = false;
  }
}
</script>
