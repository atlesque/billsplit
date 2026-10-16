<template>
  <UCard :ui="{ body: 'p-0 sm:p-0' }">
    <ul class="divide-y divide-default">
      <li v-for="p in payments" :key="p.id" class="px-4 py-3">
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

<script setup lang="ts">
/** Payments that one side marked and the other still has to confirm, with the confirm and cancel actions. */
const props = defineProps<{ data: GroupData; payments: Payment[] }>();
const emit = defineEmits<{ changed: [] }>();
const { t } = useI18n();
const api = useApi();
const toast = useToast();
const { money, formatTime } = useFormat();
const { name } = useMemberNames(() => props.data);

const cur = computed(() => props.data.group.currency);

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
