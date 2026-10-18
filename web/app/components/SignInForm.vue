<template>
  <!-- Staging: sign in as a test user instead. -->
  <div v-if="staging" class="space-y-4">
    <div>
      <h2 class="text-lg font-semibold text-highlighted">{{ title ?? $t("signin.title") }}</h2>
      <p class="mt-1 text-sm text-muted">{{ $t("testLogin.intro") }}</p>
    </div>
    <!-- A full page load: the layout only renders the page once its route has loaded. -->
    <UButton block size="lg" :label="button ?? $t('action.continue')" :href="`/test-login?next=${encodeURIComponent(next)}`" external />
  </div>

  <!-- Step 1: email. One flow for new and existing accounts. -->
  <UForm v-else-if="!sent" :state="state" class="space-y-4" @submit="start">
    <div>
      <h2 class="text-lg font-semibold text-highlighted">{{ title ?? $t("signin.title") }}</h2>
      <p class="mt-1 text-sm text-muted">{{ $t("signin.intro") }}</p>
    </div>
    <UFormField :label="$t('signin.email')" name="email" :error="error || undefined">
      <UInput v-model="state.email" type="email" autocomplete="email" inputmode="email" required autofocus class="w-full" size="lg" />
    </UFormField>
    <UButton type="submit" block size="lg" :label="button ?? $t('action.continue')" :loading="busy" />
  </UForm>

  <!-- Step 2: open the link (any device) or type the code. -->
  <UForm v-else :state="state" class="space-y-4" @submit="verify">
    <div>
      <h2 class="text-lg font-semibold text-highlighted">{{ $t("signin.checkEmail") }}</h2>
      <i18n-t keypath="signin.sent" tag="p" class="mt-1 text-sm" scope="global">
        <template #email><strong>{{ sent.email }}</strong></template>
      </i18n-t>
    </div>
    <UFormField :label="$t('signin.codeLabel')" name="code" :error="error || undefined">
      <UPinInput v-model="code" :length="6" type="number" otp size="xl" autofocus class="w-full justify-between" @complete="verify" />
    </UFormField>
    <UButton type="submit" block size="lg" :label="$t('signin.submit')" :loading="busy" />
    <div class="flex flex-wrap gap-1">
      <UButton variant="ghost" color="neutral" size="sm" :label="$t('signin.resend')" :loading="resending" @click="resend" />
      <UButton variant="ghost" color="neutral" size="sm" :label="$t('signin.otherEmail')" @click="sent = null" />
    </div>
    <p class="text-sm text-muted">{{ $t("signin.spam") }}</p>
  </UForm>
</template>

<script setup lang="ts">
const props = defineProps<{ next?: string; title?: string; button?: string }>();
const { t } = useI18n();
const api = useApi();
const toast = useToast();
const { signedIn, staging } = useSession();

const state = reactive({ email: "" });
const code = ref<(number | undefined)[]>([]);
const sent = ref<{ requestId: string; email: string } | null>(null);
const error = ref("");
const busy = ref(false);
const resending = ref(false);
const next = computed(() => props.next ?? "/");

async function start() {
  error.value = "";
  busy.value = true;
  try {
    sent.value = await api("/auth/start", { method: "POST", body: { email: state.email, next: next.value } });
    code.value = [];
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    busy.value = false;
  }
}

async function resend() {
  resending.value = true;
  try {
    sent.value = await api("/auth/start", { method: "POST", body: { email: sent.value!.email, next: next.value } });
    toast.add({ title: t("signin.resent") });
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    resending.value = false;
  }
}

async function verify(value?: unknown) {
  if (busy.value || !sent.value) return;
  const digits = Array.isArray(value) ? value : code.value;
  error.value = "";
  busy.value = true;
  try {
    finish(await api("/auth/verify", { method: "POST", body: { requestId: sent.value.requestId, code: digits.join("") } }));
  } catch (err) {
    error.value = (err as Error).message;
    code.value = [];
  } finally {
    busy.value = false;
  }
}

function finish(res: { user: User; isAdmin?: boolean; next?: string }) {
  signedIn(res);
  const to = res.next && res.next !== "/signin" ? res.next : next.value;
  navigateTo(to, { replace: true });
}

// If the link is opened in another tab of this browser, pick up the new session here too.
let poll: ReturnType<typeof setInterval> | undefined;
watch(sent, (value) => {
  clearInterval(poll);
  if (!value) return;
  poll = setInterval(async () => {
    const res = await api("/me").catch(() => null);
    if (res?.user) {
      clearInterval(poll);
      finish({ user: res.user, isAdmin: res.isAdmin });
    }
  }, 4000);
});
onBeforeUnmount(() => clearInterval(poll));
</script>
