<template>
  <div class="mx-auto max-w-md">
    <BackLink />
    <UCard>
      <h1 class="text-2xl font-bold text-highlighted">{{ $t("groups.create") }}</h1>
      <p class="mt-1 mb-4 text-sm text-muted">{{ $t("newGroup.help") }}</p>
      <UForm :state="state" class="space-y-4" @submit="create">
        <UFormField :label="$t('newGroup.name')" name="name">
          <UInput v-model="state.name" maxlength="80" :placeholder="$t('newGroup.namePlaceholder')" required autofocus class="w-full" />
        </UFormField>
        <div class="grid gap-4 sm:grid-cols-[1fr_8rem]">
          <UFormField :label="$t('account.yourName')" name="myName">
            <UInput v-model="state.myName" maxlength="60" required class="w-full" />
          </UFormField>
          <UFormField :label="$t('field.currency')" name="currency">
            <USelect v-model="state.currency" :items="CURRENCIES" class="w-full" />
          </UFormField>
        </div>
        <p v-if="error" class="text-sm text-error">{{ error }}</p>
        <UButton type="submit" block size="lg" :label="$t('newGroup.submit')" :loading="busy" />
      </UForm>
    </UCard>
  </div>
</template>

<script setup lang="ts">
const api = useApi();
const { me } = useSession();
const state = reactive({ name: "", myName: me.value?.name ?? "", currency: "EUR" });
const error = ref("");
const busy = ref(false);

async function create() {
  error.value = "";
  busy.value = true;
  try {
    const { id } = await api<{ id: string }>("/groups", { method: "POST", body: state });
    if (me.value && !me.value.name) me.value = { ...me.value, name: state.myName.trim() };
    await navigateTo(`/g/${id}?share=1`, { replace: true });
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    busy.value = false;
  }
}
</script>
