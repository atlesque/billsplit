<template>
  <div>
    <!-- Payments that one side marked and the other still has to confirm. -->
    <template v-if="data.payments.length">
      <h2 class="mb-2 text-lg font-semibold text-highlighted">{{ $t("payments.title") }}</h2>
      <p v-if="toConfirm" class="mb-2 text-sm text-muted">{{ $t("payments.checkHelp") }}</p>
      <UCard :ui="{ body: 'p-0 sm:p-0' }" class="mb-6">
        <ul class="divide-y divide-default">
          <li v-for="p in data.payments" :key="p.id" class="px-4 py-3">
            <div class="flex items-start gap-3">
              <i18n-t :keypath="sentence(p)" tag="span" class="min-w-0 flex-1" scope="global">
                <template #from><strong>{{ name(p.from) }}</strong></template>
                <template #to><strong>{{ name(p.to, { object: true }) }}</strong></template>
                <template #amount><strong class="tabular-nums">{{ money(p.amount, cur) }}</strong></template>
              </i18n-t>
              <UBadge :color="p.status === 'failed' ? 'error' : 'neutral'" variant="subtle" class="shrink-0" :label="statusLabel(p)" />
            </div>
            <p class="mt-0.5 text-xs text-muted">{{ formatTime(p.createdAt) }}</p>
            <div v-if="(p.canConfirm && p.status !== 'failed') || p.canCancel" class="mt-2 flex flex-wrap gap-2">
              <template v-if="p.canConfirm && p.status !== 'failed'">
                <UButton size="sm" icon="i-lucide-check" :label="$t('payments.received')" :loading="busyId === p.id" @click="answer(p, 'received')" />
                <UButton v-if="p.status === 'sent'" size="sm" color="neutral" variant="outline" :label="$t('payments.notReceived')" @click="answer(p, 'not_received')" />
                <UButton size="sm" color="error" variant="outline" :label="$t('payments.failed')" @click="answer(p, 'failed')" />
              </template>
              <UButton v-if="p.canCancel" size="sm" color="neutral" variant="ghost" :label="$t(p.status === 'failed' ? 'payments.dismiss' : 'payments.cancel')" @click="cancel(p)" />
            </div>
          </li>
        </ul>
      </UCard>
    </template>

    <h2 class="mb-2 text-lg font-semibold text-highlighted">{{ $t("balances.title") }}</h2>
    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <ul class="divide-y divide-default">
        <li v-for="m in data.members" :key="m.id" class="flex items-center gap-3 px-4 py-2.5">
          <span class="w-1/3 min-w-0 truncate font-semibold text-highlighted">{{ m.isMe ? $t("nameYou", { name: m.name }) : m.name }}</span>
          <span class="grid h-6 flex-1 grid-cols-2" aria-hidden="true">
            <span class="relative border-e border-default">
              <span v-if="m.balance < 0" class="absolute inset-y-0.5 end-0 rounded bg-error" :style="{ width: `${(Math.abs(m.balance) / max) * 100}%` }" />
            </span>
            <span class="relative">
              <span v-if="m.balance > 0" class="absolute inset-y-0.5 start-0 rounded bg-primary" :style="{ width: `${(m.balance / max) * 100}%` }" />
            </span>
          </span>
          <span class="w-28 text-end font-semibold whitespace-nowrap tabular-nums" :class="tone(m.balance)">{{ m.balance > 0 ? "+" : "" }}{{ money(m.balance, cur) }}</span>
        </li>
      </ul>
    </UCard>

    <h2 class="mt-6 mb-2 text-lg font-semibold text-highlighted">{{ $t("balances.settleUp") }}</h2>
    <template v-if="data.settlements.length">
      <p class="mb-2 text-sm text-muted">{{ $t("balances.settleHelp") }}</p>
      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <ul class="divide-y divide-default">
          <li v-for="(s, i) in data.settlements" :key="i" class="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
            <i18n-t :keypath="s.from === data.meId ? 'balances.youPay' : 'balances.pays'" tag="span" class="min-w-0 flex-1" scope="global">
              <template #you><strong>{{ $t("you") }}</strong></template>
              <template #from><strong>{{ name(s.from) }}</strong></template>
              <template #to><strong>{{ name(s.to, { object: true }) }}</strong></template>
            </i18n-t>
            <span class="font-semibold whitespace-nowrap tabular-nums">{{ money(s.amount, cur) }}</span>
            <UBadge v-if="pendingFor(s)" color="neutral" variant="subtle" :label="$t('payments.pending')" />
            <UButton v-else-if="s.from === data.meId" size="sm" icon="i-lucide-qr-code" :label="$t('balances.pay')" @click="pay(s)" />
            <UButton v-else-if="s.to === data.meId" size="sm" color="neutral" variant="outline" :label="$t('balances.markReceived')" @click="record(s)" />
            <UButton v-else-if="!member(s.from)?.claimed" size="sm" color="neutral" variant="outline" :label="$t('balances.markPaid')" @click="record(s)" />
          </li>
        </ul>
      </UCard>
    </template>
    <UCard v-else class="py-4 text-center text-muted">{{ $t("balances.allSettled") }}</UCard>

    <h2 class="mt-6 mb-2 text-lg font-semibold text-highlighted">{{ $t("balances.totals") }}</h2>
    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <ul class="divide-y divide-default">
        <li v-for="m in data.members" :key="m.id" class="flex flex-wrap items-center justify-between gap-x-3 px-4 py-3">
          <span>{{ m.name }}</span>
          <span class="text-sm text-muted tabular-nums">{{ $t("balances.paidShare", { paid: money(m.paid, cur), share: money(m.spent, cur) }) }}</span>
        </li>
      </ul>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import { ConfirmModal, SettleModal } from "#components";

const props = defineProps<{ data: GroupData }>();
const emit = defineEmits<{ changed: [] }>();
const { t } = useI18n();
const api = useApi();
const toast = useToast();
const { money, formatTime } = useFormat();
const { name } = useMemberNames(() => props.data);
const overlay = useOverlay();
const settleModal = overlay.create(SettleModal);
const confirmModal = overlay.create(ConfirmModal);

const cur = computed(() => props.data.group.currency);
const max = computed(() => Math.max(1, ...props.data.members.map((m) => Math.abs(m.balance))));
const member = (id: string) => props.data.members.find((m) => m.id === id);
const toConfirm = computed(() => props.data.payments.some((p) => p.canConfirm && p.status !== "failed"));
const pendingFor = (s: Settlement) => props.data.payments.some((p) => p.from === s.from && p.to === s.to && p.status !== "failed");

function sentence(p: Payment) {
  if (p.to === props.data.meId) return "payments.sentToYou";
  if (p.from === props.data.meId) return "payments.youSent";
  return "payments.sent";
}

function statusLabel(p: Payment) {
  if (p.status === "failed") return t("payments.statusFailed");
  if (p.status === "not_received") return t("payments.statusNotReceived");
  return p.canConfirm ? t("payments.statusToConfirm") : t("payments.statusWaiting", { name: name(p.to, { object: true }) });
}

async function pay(s: Settlement) {
  if (await settleModal.open({ data: props.data, settlement: s }).result) emit("changed");
}

/** Recording a payment you received, or one for someone without an account, counts straight away. */
async function record(s: Settlement) {
  const vars = { from: name(s.from), to: name(s.to, { object: true }), amount: money(s.amount, cur.value) };
  const ok = await confirmModal.open({
    title: t(s.to === props.data.meId ? "balances.markReceived" : "balances.markPaid"),
    description: t(s.to === props.data.meId ? "payments.recordReceivedConfirm" : "payments.recordConfirm", vars),
    confirmLabel: t("payments.record"),
    color: "primary",
  }).result;
  if (!ok) return;
  try {
    await api(`/groups/${props.data.group.id}/payments`, { method: "POST", body: { from: s.from, to: s.to, amount: s.amount } });
    toast.add({ title: t("payments.recorded"), color: "success" });
    emit("changed");
  } catch (err) {
    toast.add({ title: (err as Error).message, color: "error" });
  }
}

const busyId = ref("");
async function answer(p: Payment, status: Exclude<PaymentStatus, "sent">) {
  busyId.value = p.id;
  try {
    await api(`/groups/${props.data.group.id}/payments/${p.id}`, { method: "PATCH", body: { status } });
    toast.add({ title: t(`payments.answered.${status}`), color: status === "failed" ? "neutral" : "success" });
    emit("changed");
  } catch (err) {
    toast.add({ title: (err as Error).message, color: "error" });
  } finally {
    busyId.value = "";
  }
}

async function cancel(p: Payment) {
  try {
    await api(`/groups/${props.data.group.id}/payments/${p.id}`, { method: "DELETE" });
    emit("changed");
  } catch (err) {
    toast.add({ title: (err as Error).message, color: "error" });
  }
}
</script>
