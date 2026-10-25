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
        <!-- Paying is the point of this list, so Pay is a big filled button on a line of its own, left-aligned like Add expense.
             Once you've opened the pay dialog, you probably paid in your banking app, so marking it paid becomes the main button. -->
        <template v-else-if="s.from === data.meId && isOpened(data.group.id, s)">
          <UButton
            block
            size="lg"
            icon="i-lucide-check"
            class="basis-full justify-start"
            :label="$t('balances.markAsPaid')"
            :loading="busy === s"
            @click="markSent(s)"
          />
          <UButton color="neutral" variant="link" size="sm" class="-mt-1 px-0" icon="i-lucide-qr-code" :label="$t('balances.showDetails')" @click="pay(s)" />
        </template>
        <UButton
          v-else-if="s.from === data.meId"
          block
          size="lg"
          icon="i-lucide-qr-code"
          class="basis-full justify-start"
          :ui="{ leadingIcon: 'max-sm:hidden' }"
          :label="$t('balances.pay')"
          @click="pay(s)"
        />
        <!-- Money you receive can be marked as received right away, without waiting for the sender to mark it as sent. -->
        <UButton
          v-else-if="s.to === data.meId"
          block
          size="lg"
          color="neutral"
          variant="outline"
          icon="i-lucide-hand-coins"
          class="basis-full justify-start"
          :label="$t('balances.markReceived')"
          @click="record(s)"
        />
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
const pendingFor = (s: Settlement) => settlementPending(props.data, s);
const { isOpened, markOpened, forget } = useOpenedPayments();

async function pay(s: Settlement) {
  markOpened(props.data.group.id, s);
  if (await settleModal.open({ data: props.data, settlement: s }).result) {
    forget(props.data.group.id, s);
    emit("changed");
  }
}

/** Same as "I've sent the money" in the pay dialog, without opening it again. */
const busy = ref<Settlement | null>(null);
async function markSent(s: Settlement) {
  busy.value = s;
  try {
    const res = await api<{ status: PaymentStatus }>(`/groups/${props.data.group.id}/payments`, {
      method: "POST",
      body: { from: s.from, to: s.to, amount: s.amount },
    });
    forget(props.data.group.id, s);
    toast.add({ title: t(res.status === "received" ? "payments.recorded" : "payments.markedSent"), color: "success" });
    emit("changed");
  } catch (err) {
    toast.add({ title: (err as Error).message, color: "error" });
  } finally {
    busy.value = null;
  }
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
