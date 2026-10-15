<template>
  <div class="space-y-4">
    <UCard>
      <h2 class="mb-3 text-lg font-semibold text-highlighted">{{ $t("settings.details") }}</h2>
      <UForm :state="state" class="space-y-4" @submit="save">
        <!-- Name and currency share a row; they stack on phones. -->
        <div class="grid gap-4 sm:grid-cols-[1fr_8rem]">
          <UFormField :label="$t('field.name')" name="name">
            <UInput v-model="state.name" maxlength="80" required class="w-full" />
          </UFormField>
          <UFormField :label="$t('field.currency')" name="currency">
            <USelect v-model="state.currency" :items="currencies" class="w-full" />
          </UFormField>
        </div>
        <UFormField :label="$t('field.description')" name="description">
          <UTextarea v-model="state.description" :rows="2" maxlength="300" autoresize class="w-full" />
        </UFormField>
        <p v-if="error" class="text-sm text-error">{{ error }}</p>
        <UButton type="submit" :label="$t('action.save')" :loading="busy" />
      </UForm>
    </UCard>

    <UCard>
      <h2 class="text-lg font-semibold text-highlighted">{{ $t("settings.export") }}</h2>
      <p class="mt-1 mb-3 text-sm text-muted">{{ $t("settings.exportHelp") }}</p>
      <UButton :href="`/api/groups/${group.id}/export.csv?lang=${locale}`" external download color="neutral" variant="outline" icon="i-lucide-download" :label="$t('settings.downloadCsv')" />
    </UCard>

    <UCard>
      <h2 class="text-lg font-semibold text-highlighted">{{ $t("settings.leaveOrDelete") }}</h2>
      <p class="mt-1 mb-3 text-sm text-muted">{{ $t("settings.leaveHelp") }} {{ group.isOwner ? $t("settings.deleteHelp") : "" }}</p>
      <div class="flex flex-wrap gap-2">
        <UButton color="error" variant="soft" icon="i-lucide-log-out" :label="$t('settings.leave')" @click="leave" />
        <UButton v-if="group.isOwner" color="error" variant="soft" icon="i-lucide-trash-2" :label="$t('settings.delete')" @click="remove" />
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import { ConfirmModal } from "#components";

const props = defineProps<{ data: GroupData }>();
const emit = defineEmits<{ changed: [] }>();
const { t, locale } = useI18n();
const api = useApi();
const toast = useToast();
const confirmModal = useOverlay().create(ConfirmModal);

const group = computed(() => props.data.group);
const state = reactive({ name: group.value.name, currency: group.value.currency, description: group.value.description ?? "" });
const currencies = computed(() => [...new Set([group.value.currency, ...CURRENCIES])]);
const error = ref("");
const busy = ref(false);

async function save() {
  error.value = "";
  busy.value = true;
  try {
    await api(`/groups/${group.value.id}`, { method: "PATCH", body: state });
    toast.add({ title: t("toast.saved"), color: "success" });
    emit("changed");
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    busy.value = false;
  }
}

async function leave() {
  if (!(await confirmModal.open({ title: t("settings.leave"), description: t("settings.leaveConfirm"), confirmLabel: t("settings.leave") }).result)) return;
  await api(`/groups/${group.value.id}/leave`, { method: "POST" });
  await navigateTo("/");
}

async function remove() {
  const ok = await confirmModal.open({
    title: t("settings.deleteTitle"),
    description: t("settings.deleteConfirm"),
    confirmLabel: t("settings.delete"),
    requireText: group.value.name,
    textLabel: t("settings.typeName"),
  }).result;
  if (!ok) return;
  await api(`/groups/${group.value.id}`, { method: "DELETE" });
  toast.add({ title: t("settings.deleted") });
  await navigateTo("/");
}
</script>
