<template>
  <UModal :title="$t('account.title')" :description="$t('account.signedInAs', { email: me?.email ?? '' })">
    <template #body>
      <UForm :state="state" :validate="validate" :validate-on="['blur']" class="space-y-4" @submit="save">
        <UFormField :label="$t('account.yourName')" name="name">
          <UInput v-model="state.name" maxlength="60" required class="w-full" autofocus />
        </UFormField>

        <USeparator />
        <div>
          <h3 class="font-semibold text-highlighted">{{ $t("bank.title") }}</h3>
          <p class="text-sm text-muted">{{ $t("bank.help") }}</p>
        </div>
        <UFormField :label="$t('bank.holder')" name="holder">
          <UInput v-model="state.holder" :maxlength="MAX_HOLDER_NAME" autocomplete="name" class="w-full" />
        </UFormField>
        <UFormField :label="$t('bank.iban')" name="iban">
          <UInput v-model="state.iban" placeholder="BE71 0961 2345 6769" autocomplete="off" spellcheck="false" class="w-full font-mono" :ui="{ base: 'uppercase' }" />
        </UFormField>
        <UFormField :label="$t('bank.bic')" :hint="$t('bank.optional')" name="bic" :help="$t('bank.bicHelp')">
          <UInput v-model="state.bic" placeholder="GKCCBEBB" maxlength="14" autocomplete="off" spellcheck="false" class="w-full font-mono" :ui="{ base: 'uppercase' }" />
        </UFormField>

        <p v-if="error" class="text-sm text-error">{{ error }}</p>
        <div class="flex flex-wrap gap-2">
          <UButton type="submit" :label="$t('action.save')" :loading="busy" />
          <UButton v-if="staging" color="neutral" variant="outline" :label="$t('testLogin.switch')" to="/test-login" @click="emit('close')" />
          <UButton color="error" variant="outline" :label="$t('account.signOut')" @click="logout" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import type { FormError } from "@nuxt/ui";

const emit = defineEmits<{ close: [] }>();
const { t } = useI18n();
const api = useApi();
const toast = useToast();
const { me, staging, signedOut } = useSession();
const bank = me.value?.bank;
const state = reactive({
  name: me.value?.name ?? "",
  holder: bank?.name ?? me.value?.name ?? "",
  iban: bank ? formatIban(bank.iban) : "",
  bic: bank?.bic ?? "",
});
const error = ref("");
const busy = ref(false);

const IBAN_MESSAGES = { format: "bank.ibanFormat", country: "bank.ibanCountry", length: "bank.ibanLength", checksum: "bank.ibanChecksum" };

/** Same checks as the Worker, so typos show up next to the field. An empty IBAN removes the bank details. */
function validate(s: typeof state): FormError[] {
  const errors: FormError[] = [];
  const iban = compactIban(s.iban);
  if (!iban) return errors;
  const problem = ibanProblem(iban);
  if (problem) errors.push({ name: "iban", message: t(IBAN_MESSAGES[problem]) });
  if (!s.holder.trim()) errors.push({ name: "holder", message: t("bank.holderRequired") });
  if (s.bic.trim() && !isBic(compactIban(s.bic))) errors.push({ name: "bic", message: t("bank.bicInvalid") });
  return errors;
}

async function save() {
  busy.value = true;
  error.value = "";
  try {
    const before = me.value?.bank;
    const iban = compactIban(state.iban);
    if (state.name.trim() !== me.value?.name) me.value = await api<User>("/me", { method: "PATCH", body: { name: state.name } });
    if (iban !== (before?.iban ?? "") || (iban && (state.holder.trim() !== before?.name || compactIban(state.bic) !== before?.bic))) {
      me.value = await api<User>("/me/bank", { method: "PUT", body: { name: state.holder, iban, bic: state.bic } });
    }
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
