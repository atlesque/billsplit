<template>
  <UModal :title="heading" :ui="{ content: 'sm:max-w-xl' }">
    <template #body>
      <!-- Someone else's expense: just the details, no fields. -->
      <div v-if="readOnly" class="space-y-4">
        <div>
          <p class="text-lg font-semibold text-highlighted">{{ expenseTitle(expense!) }}</p>
          <p class="text-2xl font-semibold text-highlighted tabular-nums">{{ money(expense!.amount, cur) }}</p>
        </div>
        <dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt class="text-muted">{{ $t("expense.date") }}</dt>
          <dd class="text-default">{{ formatDate(expense!.date) }}</dd>
          <dt class="text-muted">{{ $t(transfer ? "expense.from" : "expense.paidBy") }}</dt>
          <dd class="text-default">{{ name(expense!.paidBy) }}</dd>
          <template v-if="transfer">
            <dt class="text-muted">{{ $t("expense.to") }}</dt>
            <dd class="text-default">{{ name(expense!.shares[0]?.memberId) }}</dd>
          </template>
          <template v-else-if="expense!.category">
            <dt class="text-muted">{{ $t("expense.category") }}</dt>
            <dd class="text-default">{{ categoryLabel(expense!.category) }}</dd>
          </template>
        </dl>
        <div v-if="!transfer">
          <p class="text-sm font-medium text-default">{{ $t("expense.splitBetween") }} · {{ modes.find((m) => m.value === mode)?.label }}</p>
          <ul class="mt-1 divide-y divide-default">
            <li v-for="s in expense!.shares" :key="s.memberId" class="flex min-h-10 items-center gap-3 py-1.5 text-sm">
              <span class="min-w-0 flex-1 truncate text-default">{{ name(s.memberId) }}</span>
              <span v-if="mode === 'shares'" class="text-muted">{{ $t("expense.sharesCount", s.weight) }}</span>
              <span class="w-24 text-end text-default tabular-nums">{{ money(s.amount ?? preview.get(s.memberId) ?? 0, cur) }}</span>
            </li>
          </ul>
        </div>
        <p class="text-sm text-muted">{{ $t("expense.readOnly") }}</p>
      </div>
      <UForm v-else id="expense-form" :state="form" class="space-y-4" @submit="submit">
        <UTabs v-model="kind" :items="kinds" :content="false" size="sm" :aria-label="$t('expense.type')" />

        <UFormField v-if="!transfer" :label="$t('expense.what')" name="title">
          <UInput v-model="form.title" maxlength="100" :placeholder="$t('expense.whatPlaceholder')" :autofocus="!expense" class="w-full" />
        </UFormField>

        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField :label="$t('expense.amount', { currency: cur })" name="amount">
            <UInput v-model="form.amount" v-bind="amountField" required class="w-full" />
          </UFormField>
          <UFormField :label="$t('expense.date')" name="date">
            <UInput v-model="form.date" type="date" required class="w-full" />
          </UFormField>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField :label="$t(transfer ? 'expense.from' : 'expense.paidBy')" name="paidBy">
            <USelect v-model="form.paidBy" :items="memberItems" class="w-full" />
          </UFormField>
          <UFormField v-if="transfer" :label="$t('expense.to')" name="to">
            <USelect v-model="form.to" :items="memberItems" class="w-full" />
          </UFormField>
          <UFormField v-else :label="$t('expense.category')" name="category">
            <USelect v-model="form.category" :items="categoryItems" class="w-full" />
          </UFormField>
        </div>

        <div v-if="!transfer">
          <p class="mb-1.5 text-sm font-medium text-default">{{ $t("expense.splitBetween") }}</p>
          <UTabs :model-value="mode" :items="modes" :content="false" size="sm" :aria-label="$t('expense.splitMode')" @update:model-value="setMode" />
          <ul class="mt-2 divide-y divide-default">
            <li v-for="m in data.members" :key="m.id" class="flex min-h-11 items-center gap-3 py-1.5">
              <UCheckbox :model-value="weights[m.id]! > 0" :label="label(m)" class="min-w-0 flex-1" @update:model-value="(on) => toggle(m.id, Boolean(on))" />
              <UInput
                v-if="mode === 'shares'"
                :model-value="String(weights[m.id])"
                type="number"
                min="0"
                step="1"
                inputmode="numeric"
                class="w-24"
                :ui="{ base: 'text-end' }"
                :aria-label="$t('expense.sharesFor', { name: m.name })"
                @update:model-value="(v) => setWeight(m.id, String(v))"
              />
              <UInput
                v-else-if="mode === 'amounts'"
                :model-value="amountInputs[m.id]"
                v-bind="amountField"
                class="w-28"
                :ui="{ base: 'text-end' }"
                :aria-label="$t('expense.amountFor', { name: m.name })"
                @update:model-value="(v) => setWeight(m.id, String(v))"
              />
              <span class="w-24 text-end text-sm text-muted tabular-nums">{{ weights[m.id]! > 0 ? money(preview.get(m.id) ?? 0, cur) : "—" }}</span>
            </li>
          </ul>
          <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <p class="text-sm" :class="summary.bad ? 'neg' : 'text-muted'">{{ summary.text }}</p>
            <UButton
              v-if="mode === 'amounts' && assigned > 0 && assigned !== amount"
              size="xs"
              color="primary"
              variant="soft"
              icon="i-lucide-check"
              :label="$t('expense.setTotal', { amount: money(assigned, cur) })"
              @click="form.amount = amountInput(assigned)"
            />
          </div>
        </div>

        <p v-if="error" class="text-sm text-error">{{ error }}</p>
      </UForm>
    </template>
    <template #footer>
      <div v-if="readOnly" class="flex w-full justify-end">
        <UButton color="neutral" variant="outline" :label="$t('action.close')" @click="emit('close', false)" />
      </div>
      <div v-else class="flex w-full flex-wrap gap-2">
        <UButton type="submit" form="expense-form" class="flex-1 justify-center" :label="$t(isEdit ? 'action.save' : 'action.add')" :loading="busy" />
        <UButton v-if="isEdit" color="error" variant="outline" :label="$t('action.delete')" @click="remove" />
        <UButton color="neutral" variant="ghost" :label="$t('action.cancel')" @click="emit('close', false)" />
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { ConfirmModal } from "#components";

const props = defineProps<{ data: GroupData; expense: Expense | null; fromTemplate?: boolean }>();
const emit = defineEmits<{ close: [changed: boolean] }>();
const { t } = useI18n();
const api = useApi();
const toast = useToast();
const { money, formatDate, amountInput, amountField } = useFormat();
const { name, label, expenseTitle, categoryLabel } = useMemberNames(() => props.data);
const confirmModal = useOverlay().create(ConfirmModal);

const NO_CATEGORY = "-";
const members = props.data.members;
const meId = props.data.meId;
const cur = props.data.group.currency;
const expense = props.expense;
// "Mark paid" opens a prefilled payment that is still a new one.
const isEdit = Boolean(expense?.id) && !props.fromTemplate;
// Someone else's expense opens as read-only details; the server refuses changes too.
const readOnly = isEdit && expense?.canEdit === false;

const kind = ref<Expense["kind"]>(expense?.kind ?? "expense");
const transfer = computed(() => kind.value === "transfer");
const mode = ref<SplitMode>(expense?.splitMode ?? "equal");
// Per person: 0 = not in the split; else 1 (equal), a share count, or cents (amounts).
const weights = reactive<Record<string, number>>(Object.fromEntries(members.map((m) => [m.id, expense ? 0 : 1])));
for (const s of expense?.shares ?? []) weights[s.memberId] = s.weight;
// What's typed in the per-person amount fields, so typing "12," isn't reformatted under the cursor.
const amountInputs = reactive<Record<string, string>>({});
const syncAmountInputs = () => members.forEach((m) => (amountInputs[m.id] = weights[m.id] ? amountInput(weights[m.id]!) : ""));
syncAmountInputs();

const form = reactive({
  title: expense?.title ?? "",
  amount: expense ? amountInput(expense.amount) : "",
  date: expense?.date ?? today(),
  paidBy: expense?.paidBy ?? meId,
  category: expense?.category || NO_CATEGORY,
  to: expense?.kind === "transfer" ? (expense.shares[0]?.memberId ?? meId) : (members.find((m) => m.id !== meId)?.id ?? meId),
});
const error = ref("");
const busy = ref(false);

const heading = computed(() => t(`expense.${readOnly ? "view" : isEdit ? "edit" : "add"}${transfer.value ? "Payment" : "Expense"}`));
const kinds = computed(() => [
  { label: t("expense.expense"), value: "expense" },
  { label: t("expense.transfer"), value: "transfer" },
]);
const modes = computed(() => [
  { label: t("expense.equally"), value: "equal" },
  { label: t("expense.byShares"), value: "shares" },
  { label: t("expense.byAmount"), value: "amounts" },
]);
const memberItems = computed(() => members.map((m) => ({ label: label(m), value: m.id })));
const categoryItems = computed(() => {
  const values = [...new Set([...(expense?.category ? [expense.category] : []), ...Object.keys(CATEGORIES)])];
  return [{ label: t("expense.noCategory"), value: NO_CATEGORY }, ...values.map((c) => ({ label: categoryLabel(c), value: c }))];
});

const amount = computed(() => parseAmount(form.amount) || 0);
const active = computed(() => members.filter((m) => weights[m.id]! > 0));

/** Each person's share in cents, as the server will compute it (before spreading leftover cents). */
const preview = computed(() => {
  const result = new Map<string, number>();
  if (mode.value === "amounts") {
    for (const m of active.value) result.set(m.id, weights[m.id]!);
    return result;
  }
  const weight = (id: string) => (mode.value === "equal" ? 1 : weights[id]!);
  const sum = active.value.reduce((a, m) => a + weight(m.id), 0);
  for (const m of active.value) result.set(m.id, sum ? Math.round((amount.value * weight(m.id)) / sum) : 0);
  return result;
});

/** The per-person amounts added up, in cents (only used when splitting by amount). */
const assigned = computed(() => Object.values(weights).reduce((a, b) => a + b, 0));

const summary = computed(() => {
  if (mode.value === "amounts") {
    // Amounts typed in before the total: no error yet, the total can be set from them.
    if (!amount.value && assigned.value) return { text: t("expense.assignedSoFar", { amount: money(assigned.value, cur) }), bad: false };
    const left = amount.value - assigned.value;
    const key = left === 0 ? "expense.allAssigned" : left > 0 ? "expense.leftToAssign" : "expense.tooMuch";
    return { text: t(key, { amount: money(left === 0 ? amount.value : Math.abs(left), cur) }), bad: left !== 0 };
  }
  const count = active.value.length;
  return { text: count ? t("expense.splitCount", count) : t("expense.pickOne"), bad: false };
});

function toggle(id: string, on: boolean) {
  weights[id] = on ? 1 : 0;
  if (mode.value === "amounts" && on) {
    // A newly ticked person gets whatever is still unassigned.
    const assigned = Object.entries(weights).filter(([k]) => k !== id).reduce((a, [, b]) => a + b, 0);
    weights[id] = Math.max(0, amount.value - assigned) || 1;
  }
  syncAmountInputs();
}

function setWeight(id: string, value: string) {
  if (mode.value === "amounts") amountInputs[id] = value;
  const v = mode.value === "shares" ? parseInt(value, 10) : parseAmount(value);
  weights[id] = Number.isFinite(v) && v > 0 ? v : 0;
}

function setMode(next: string | number) {
  if (next === mode.value) return;
  const shares = preview.value;
  for (const m of members) {
    const on = weights[m.id]! > 0;
    weights[m.id] = !on ? 0 : next === "amounts" ? (shares.get(m.id) ?? 0) : 1;
  }
  mode.value = next as SplitMode;
  syncAmountInputs();
}

async function submit() {
  error.value = "";
  const cents = parseAmount(form.amount);
  if (!Number.isFinite(cents) || cents <= 0) return (error.value = t("expense.invalidAmount"));
  if (!transfer.value && !form.title.trim()) return (error.value = t("expense.titleRequired"));
  if (transfer.value && form.to === form.paidBy) return (error.value = t("expense.samePerson"));
  const body = {
    kind: kind.value,
    title: transfer.value ? "Payment" : form.title,
    amount: cents,
    date: form.date,
    paidBy: form.paidBy,
    category: transfer.value || form.category === NO_CATEGORY ? "" : form.category,
    splitMode: transfer.value ? "equal" : mode.value,
    shares: transfer.value ? [{ memberId: form.to, weight: 1 }] : active.value.map((m) => ({ memberId: m.id, weight: weights[m.id] })),
  };
  busy.value = true;
  try {
    const groupId = props.data.group.id;
    if (isEdit) await api(`/groups/${groupId}/expenses/${expense!.id}`, { method: "PUT", body });
    else await api(`/groups/${groupId}/expenses`, { method: "POST", body });
    toast.add({ title: t(isEdit ? "toast.saved" : transfer.value ? "expense.paymentRecorded" : "expense.added"), color: "success" });
    emit("close", true);
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    busy.value = false;
  }
}

async function remove() {
  const ok = await confirmModal.open({ title: t("expense.deleteConfirm", { title: expenseTitle(expense!) }), confirmLabel: t("action.delete") }).result;
  if (!ok) return;
  await api(`/groups/${props.data.group.id}/expenses/${expense!.id}`, { method: "DELETE" });
  toast.add({ title: t("toast.deleted") });
  emit("close", true);
}
</script>
