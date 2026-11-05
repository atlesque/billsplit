<template>
  <PageSpinner v-if="pending" />
  <ErrorState v-else-if="error" :error="error" />
  <UCard v-else-if="link" class="mx-auto max-w-md">
    <!-- The link works: the payment, then one button. Nothing is confirmed on page load, so email link scanners can't. -->
    <template v-if="link.state === 'open' && p">
      <p class="mb-1 text-xs font-bold tracking-wider text-primary uppercase">{{ $t("confirmPayment.eyebrow") }}</p>
      <p class="text-4xl font-bold tabular-nums text-highlighted">{{ money(p.amount, p.currency) }}</p>
      <p class="mt-1 text-muted">{{ $t("confirmPayment.says", { name: p.from }) }}</p>
      <dl :class="details">
        <template v-for="row in rows" :key="row.label">
          <dt class="text-muted">{{ row.label }}</dt>
          <dd class="min-w-0 text-right font-medium break-words text-highlighted">{{ row.value }}</dd>
        </template>
      </dl>
      <UAlert
        v-if="p.status === 'not_received'"
        class="mt-4"
        color="neutral"
        variant="subtle"
        icon="i-lucide-hourglass"
        :description="$t('confirmPayment.notReceivedBefore')"
      />
      <p class="mt-4 text-sm text-muted">{{ $t("confirmPayment.checkBank") }}</p>
      <p v-if="confirmError" class="mt-3 text-sm text-error">{{ confirmError }}</p>
      <UButton class="mt-4" block size="lg" icon="i-lucide-check" :label="$t('confirmPayment.confirm')" :loading="busy" @click="confirm" />
      <UButton
        class="mt-2"
        block
        color="neutral"
        variant="ghost"
        :to="`/g/${p.groupId}`"
        :label="$t('confirmPayment.openGroup', { group: p.groupName })"
      />
    </template>

    <!-- Every other state: an icon, what happened, and a way on. -->
    <template v-else>
      <div class="flex size-11 items-center justify-center rounded-full" :class="outcome.tone">
        <UIcon :name="outcome.icon" class="size-6" />
      </div>
      <h1 class="mt-3 text-xl font-bold text-highlighted">{{ outcome.title }}</h1>
      <p class="mt-1 text-muted">{{ outcome.help }}</p>
      <dl v-if="p && link.state !== 'expired'" :class="details">
        <template v-for="row in rows" :key="row.label">
          <dt class="text-muted">{{ row.label }}</dt>
          <dd class="min-w-0 text-right font-medium break-words text-highlighted">{{ row.value }}</dd>
        </template>
      </dl>
      <div class="mt-5 flex flex-col gap-2">
        <UButton
          v-if="p"
          block
          size="lg"
          :color="link.state === 'expired' ? 'primary' : 'neutral'"
          :variant="link.state === 'expired' ? 'solid' : 'outline'"
          :to="`/g/${p.groupId}`"
          :label="$t('confirmPayment.openGroup', { group: p.groupName })"
        />
        <UButton
          v-if="link.state === 'wrong_account'"
          block
          size="lg"
          color="neutral"
          variant="outline"
          icon="i-lucide-log-out"
          :label="$t('confirmPayment.otherAccount')"
          :loading="busy"
          @click="switchAccount"
        />
        <UButton
          block
          size="lg"
          :color="p ? 'neutral' : 'primary'"
          :variant="p ? 'ghost' : 'solid'"
          to="/"
          :label="$t('nav.toGroups')"
        />
      </div>
    </template>
  </UCard>
</template>

<script setup lang="ts">
/** Where the "Confirm the payment" button in a "payment sent" email goes. Signed-out visitors sign in first (the layout), then land back here. */
const route = useRoute();
const { t } = useI18n();
const api = useApi();
const { me, signedOut } = useSession();
const { money, formatTime } = useFormat();
const token = computed(() => String(route.params.token));

const { data: link, error, pending, refresh } = useLoad(
  () => ["payment-link", token.value, me.value?.id],
  () => api<PaymentLink>(`/payment-links/${token.value}`),
);
const p = computed(() => link.value?.payment);
const details = "mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-lg bg-elevated/60 px-4 py-3 text-sm";

const rows = computed(() => {
  const pay = p.value;
  if (!pay) return [];
  return [
    { label: t("confirmPayment.from"), value: pay.from },
    { label: t("confirmPayment.to"), value: t("confirmPayment.toYou", { name: pay.to }) },
    ...(link.value?.state === "open" ? [] : [{ label: t("confirmPayment.amount"), value: money(pay.amount, pay.currency) }]),
    { label: t("confirmPayment.group"), value: pay.groupName },
    { label: t("confirmPayment.sentAt"), value: formatTime(pay.sentAt) },
    ...(pay.confirmedAt ? [{ label: t("confirmPayment.confirmedAt"), value: formatTime(pay.confirmedAt) }] : []),
  ];
});

// Set once you confirm on this page, so the result reads as done rather than "already" done.
const justConfirmed = ref(false);

const outcome = computed(() => {
  const pay = p.value;
  const days = link.value?.linkDays ?? 14;
  switch (link.value?.state) {
    case "confirmed":
      return {
        icon: "i-lucide-circle-check",
        tone: "bg-success/15 text-success",
        title: t(justConfirmed.value ? "confirmPayment.doneTitle" : "confirmPayment.alreadyTitle"),
        help: t("confirmPayment.doneHelp"),
      };
    case "failed":
      return {
        icon: "i-lucide-circle-x",
        tone: "bg-error/15 text-error",
        title: t("confirmPayment.failedTitle"),
        help: t("confirmPayment.failedHelp", { name: pay?.from ?? "" }),
      };
    case "wrong_account":
      return {
        icon: "i-lucide-user-x",
        tone: "bg-warning/15 text-warning",
        title: t("confirmPayment.wrongTitle"),
        help: t("confirmPayment.wrongHelp", { email: me.value?.email ?? "" }),
      };
    default:
      return {
        icon: "i-lucide-clock-alert",
        tone: "bg-elevated text-muted",
        title: t("confirmPayment.expiredTitle"),
        help: pay
          ? t("confirmPayment.expiredHelp", { days, group: pay.groupName })
          : t("confirmPayment.goneHelp", { days }),
      };
  }
});

const busy = ref(false);
const confirmError = ref("");
async function confirm() {
  busy.value = true;
  confirmError.value = "";
  try {
    await api(`/payment-links/${token.value}`, { method: "POST" });
    justConfirmed.value = true;
  } catch (err) {
    confirmError.value = (err as Error).message;
  } finally {
    // Show whatever the payment's state is now, also when someone confirmed it elsewhere meanwhile.
    await refresh();
    busy.value = false;
  }
}

// Signing out shows the sign-in form (the layout), which brings you back here afterwards.
async function switchAccount() {
  busy.value = true;
  try {
    await api("/auth/logout", { method: "POST" });
    signedOut();
  } finally {
    busy.value = false;
  }
}
</script>
