<template>
  <UModal :title="$t('people.editName', { name: member.name })">
    <template #body>
      <UForm id="member-form" :state="state" @submit="save">
        <UFormField :label="$t('field.name')" name="name" :error="error || undefined">
          <UInput v-model="state.name" maxlength="60" required autofocus class="w-full" />
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <div class="flex w-full flex-wrap gap-2">
        <UButton type="submit" form="member-form" :label="$t('action.save')" :loading="busy" />
        <UButton v-if="!member.isMe" color="error" variant="soft" :label="$t('people.remove')" @click="remove" />
        <UButton class="ms-auto" color="neutral" variant="ghost" :label="$t('action.cancel')" @click="emit('close', false)" />
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { ConfirmModal } from "#components";

const props = defineProps<{ groupId: string; member: Member }>();
const emit = defineEmits<{ close: [changed: boolean] }>();
const { t } = useI18n();
const api = useApi();
const confirmModal = useOverlay().create(ConfirmModal);
const state = reactive({ name: props.member.name });
const error = ref("");
const busy = ref(false);

async function save() {
  busy.value = true;
  try {
    if (state.name.trim() !== props.member.name)
      await api(`/groups/${props.groupId}/members/${props.member.id}`, { method: "PATCH", body: { name: state.name } });
    emit("close", true);
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    busy.value = false;
  }
}

async function remove() {
  const text = t("people.removeConfirm", { name: props.member.name });
  if (!(await confirmModal.open({ title: text, confirmLabel: t("people.remove") }).result)) return;
  try {
    await api(`/groups/${props.groupId}/members/${props.member.id}`, { method: "DELETE" });
    emit("close", true);
  } catch (err) {
    error.value = (err as Error).message;
  }
}
</script>
