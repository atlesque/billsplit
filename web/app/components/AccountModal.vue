<template>
  <UModal :title="$t('account.title')" :description="$t('account.signedInAs', { email: me?.email ?? '' })">
    <template #body>
      <UForm :state="state" class="space-y-4" @submit="save">
        <UFormField :label="$t('account.yourName')" name="name" :error="error || undefined">
          <UInput v-model="state.name" maxlength="60" required class="w-full" autofocus />
        </UFormField>
        <div class="flex flex-wrap gap-2">
          <UButton type="submit" :label="$t('action.save')" :loading="busy" />
          <UButton color="error" variant="soft" :label="$t('account.signOut')" @click="logout" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>

<script setup lang="ts">
const emit = defineEmits<{ close: [] }>();
const { t } = useI18n();
const api = useApi();
const toast = useToast();
const { me, signedOut } = useSession();
const state = reactive({ name: me.value?.name ?? "" });
const error = ref("");
const busy = ref(false);

async function save() {
  busy.value = true;
  error.value = "";
  try {
    me.value = await api<User>("/me", { method: "PATCH", body: { name: state.name } });
    toast.add({ title: t("toast.saved"), color: "success" });
    emit("close");
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    busy.value = false;
  }
}

async function logout() {
  await api("/auth/logout", { method: "POST" });
  signedOut();
  emit("close");
  await navigateTo("/", { replace: true });
}
</script>
