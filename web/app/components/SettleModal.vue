<template>
  <UModal :title="$t('settle.title', { name: toName })" :ui="{ content: 'sm:max-w-lg' }">
    <template #body>
      <p class="text-3xl font-bold tabular-nums text-highlighted">{{ money(settlement.amount, cur) }}</p>
      <p class="mb-4 text-sm text-muted">{{ $t("settle.to", { name: toName }) }}</p>

      <UAlert v-if="!to.claimed" color="neutral" variant="subtle" icon="i-lucide-info" class="mb-4" :description="$t('settle.notOnApp', { name: to.name })" />
      <UAlert v-else-if="!bank" color="neutral" variant="subtle" icon="i-lucide-info" class="mb-4" :description="$t('settle.noBank', { name: to.name })" />
      <UAlert
        v-else-if="!euro"
        color="neutral"
        variant="subtle"
        icon="i-lucide-info"
        class="mb-4"
        :description="$t('settle.notEuro', { currency: cur })"
      />

      <template v-if="bank">
        <!-- Desktop: scan the QR code with a phone. -->
        <div v-if="euro" class="mb-4 hidden flex-col gap-2 sm:flex">
          <QrCode :value="qrPayload" :label="$t('settle.qrLabel')" class="w-52 shrink-0 ring-1 ring-default" />
          <p class="font-semibold text-highlighted">
            {{ $t("settle.scan") }}
            <UPopover :content="{ side: 'top' }">
              <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-info" class="align-middle" :aria-label="$t('settle.howToScan')" :title="$t('settle.howToScan')" />
              <template #content>
                <p class="max-w-64 p-3 text-sm">{{ $t("settle.scanHelp") }}</p>
              </template>
            </UPopover>
          </p>
        </div>

        <!-- Phone: a QR code on the screen you pay with can't be scanned, so hand the code to the banking app instead. -->
        <div v-if="euro" class="mb-5 sm:hidden">
          <UButton
            block
            size="lg"
            color="neutral"
            variant="outline"
            :icon="canShareFiles ? 'i-lucide-landmark' : 'i-lucide-download'"
            class="justify-start"
            :label="$t(canShareFiles ? 'settle.openBankApp' : 'settle.saveQr')"
            :loading="sharing"
            @click="shareToBankApp"
          />
          <p class="mt-2 text-sm text-muted">{{ $t(canShareFiles ? "settle.openBankAppHelp" : "settle.saveQrHelp") }}</p>
        </div>

        <p v-if="euro" class="mb-2 text-sm font-semibold text-highlighted sm:hidden">{{ $t("settle.payByHand") }}</p>
        <dl class="divide-y divide-default rounded-lg ring-1 ring-default">
          <div v-for="row in rows" :key="row.label" class="flex items-center gap-3 px-3 py-2">
            <div class="min-w-0 flex-1">
              <dt class="text-xs text-muted">{{ row.label }}</dt>
              <dd class="break-words text-highlighted" :class="{ 'font-mono': row.mono }">{{ row.value }}</dd>
            </div>
            <UButton
              color="neutral"
              variant="ghost"
              size="sm"
              icon="i-lucide-copy"
              :aria-label="$t('settle.copy', { what: row.label })"
              :title="$t('settle.copy', { what: row.label })"
              @click="copy(row.copy ?? row.value, $t('settle.copied', { what: row.label }))"
            />
          </div>
        </dl>

        <div v-if="euro" class="mt-4 sm:hidden">
          <UButton
            color="neutral"
            variant="ghost"
            :icon="showQr ? 'i-lucide-chevron-up' : 'i-lucide-qr-code'"
            class="-ms-2.5"
            :label="$t(showQr ? 'settle.hideQr' : 'settle.showQr')"
            :aria-expanded="showQr"
            @click="showQr = !showQr"
          />
          <div v-if="showQr" class="mt-2 flex flex-col gap-2">
            <QrCode :value="qrPayload" :label="$t('settle.qrLabel')" class="w-60 max-w-full ring-1 ring-default" />
            <p class="text-sm text-muted">{{ $t("settle.showQrHelp") }}</p>
          </div>
        </div>
      </template>
    </template>

    <template #footer>
      <div class="w-full">
        <UButton block size="lg" icon="i-lucide-check" class="justify-start" :label="$t('settle.sent')" :loading="busy" @click="markSent" />
        <p class="mt-2 text-sm text-muted">{{ $t(to.claimed ? "settle.confirmNote" : "settle.directNote", { name: to.name }) }}</p>
        <p v-if="error" class="mt-2 text-sm text-error">{{ error }}</p>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
const props = defineProps<{ data: GroupData; settlement: Settlement }>();
const emit = defineEmits<{ close: [changed: boolean] }>();
const { t } = useI18n();
const api = useApi();
const toast = useToast();
const copy = useCopy();
const { money } = useFormat();
const { name } = useMemberNames(() => props.data);

const cur = computed(() => props.data.group.currency);
const euro = computed(() => cur.value === "EUR");
const to = computed(() => props.data.members.find((m) => m.id === props.settlement.to)!);
const toName = computed(() => name(props.settlement.to, { object: true }));
const bank = computed(() => to.value.bank);
const remittance = computed(() => `BillSplit - ${props.data.group.name}`);
const amountText = computed(() => (props.settlement.amount / 100).toFixed(2));

const qrPayload = computed(() =>
  epcPayload({ name: bank.value!.name, iban: bank.value!.iban, bic: bank.value!.bic, amountCents: props.settlement.amount, text: remittance.value }),
);

const rows = computed(() => {
  const b = bank.value!;
  return [
    { label: t("bank.holder"), value: b.name },
    { label: t("bank.iban"), value: formatIban(b.iban), copy: b.iban, mono: true },
    ...(b.bic ? [{ label: t("bank.bic"), value: b.bic, mono: true }] : []),
    { label: t("settle.amount"), value: money(props.settlement.amount, cur.value), copy: amountText.value },
    { label: t("settle.description"), value: remittance.value },
  ];
});

const showQr = ref(false);
const sharing = ref(false);
const qrFile = () => qrPng(qrPayload.value).then((blob) => new File([blob], "billsplit-payment.png", { type: "image/png" }));
// Phones that can share files open the share sheet, where most European banking apps accept an image with a QR code.
const canShareFiles = ref(false);
onMounted(() => {
  const probe = new File([new Blob()], "probe.png", { type: "image/png" });
  canShareFiles.value = typeof navigator.share === "function" && !!navigator.canShare?.({ files: [probe] });
});

async function shareToBankApp() {
  sharing.value = true;
  try {
    const file = await qrFile();
    if (canShareFiles.value) {
      await navigator.share({ files: [file], title: t("settle.title", { name: toName.value }) });
    } else {
      const url = URL.createObjectURL(file);
      const a = Object.assign(document.createElement("a"), { href: url, download: file.name });
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  } catch (err) {
    // Closing the share sheet isn't an error.
    if ((err as Error).name !== "AbortError") toast.add({ title: t("settle.shareFailed"), color: "error" });
  } finally {
    sharing.value = false;
  }
}

const busy = ref(false);
const error = ref("");
async function markSent() {
  busy.value = true;
  error.value = "";
  try {
    const res = await api<{ status: PaymentStatus }>(`/groups/${props.data.group.id}/payments`, {
      method: "POST",
      body: { from: props.settlement.from, to: props.settlement.to, amount: props.settlement.amount },
    });
    toast.add({ title: t(res.status === "received" ? "payments.recorded" : "payments.markedSent"), color: "success" });
    emit("close", true);
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    busy.value = false;
  }
}
</script>
