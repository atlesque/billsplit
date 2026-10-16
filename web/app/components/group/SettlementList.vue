<template>
  <UCard :ui="{ body: 'p-0 sm:p-0' }">
    <ul class="divide-y divide-default">
      <li v-for="s in settlements" :key="`${s.from}-${s.to}`" class="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
        <i18n-t :keypath="s.from === data.meId ? 'balances.youPay' : 'balances.pays'" tag="span" class="min-w-44 flex-1" scope="global">
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

<script setup lang="ts">
import { ConfirmModal, SettleModal } from "#components";

/** Who pays whom to settle up, with Pay (bank details and QR code) and Mark received. */
const props = defineProps<{ data: GroupData; settlements: Settlement[] }>();
const emit = defineEmits<{ changed: [] }>();
const { t } = useI18n();
const api = useApi();
const toast = useToast();
const { money } = useFormat();
const { name } = useMemberNames(() => props.data);
const overlay = useOverlay();
const settleModal = overlay.create(SettleModal);
const confirmModal = overlay.create(ConfirmModal);

const cur = computed(() => props.data.group.currency);
const member = (id: string) => props.data.members.find((m) => m.id === id);
const pendingFor = (s: Settlement) => props.data.payments.some((p) => p.from === s.from && p.to === s.to && p.status !== "failed");

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
</script>
