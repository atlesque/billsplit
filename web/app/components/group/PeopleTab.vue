<template>
  <div>
    <GroupLinkCard :group="data.group" compact @changed="emit('changed')" />
    <h2 class="mt-6 mb-2 text-lg font-semibold text-highlighted">{{ $t("people.title") }}</h2>
    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <ul class="divide-y divide-default">
        <li v-for="m in data.members" :key="m.id" class="flex items-center gap-3 px-4 py-3">
          <UAvatar :text="initials(m.name)" size="lg" :ui="{ root: 'bg-elevated', fallback: 'text-primary font-bold' }" />
          <span class="min-w-0 flex-1">
            <span class="block truncate font-semibold text-highlighted">{{ m.name }}</span>
            <span class="block truncate text-sm text-muted">{{ status(m) }}</span>
          </span>
          <UButton size="sm" color="neutral" variant="ghost" :label="$t('action.edit')" :aria-label="$t('people.editName', { name: m.name })" @click="edit(m)" />
        </li>
      </ul>
    </UCard>
    <p class="mt-3 text-sm text-muted">{{ $t("people.help") }}</p>
    <UForm :state="state" class="mt-3 flex gap-2" @submit="add">
      <UInput v-model="state.name" :placeholder="$t('field.name')" :aria-label="$t('field.name')" maxlength="60" required class="flex-1" />
      <UButton type="submit" color="neutral" variant="outline" icon="i-lucide-user-plus" :label="$t('people.add')" :loading="busy" />
    </UForm>
    <p v-if="error" class="mt-1 text-sm text-error">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { MemberModal } from "#components";

const props = defineProps<{ data: GroupData }>();
const emit = defineEmits<{ changed: [] }>();
const { t } = useI18n();
const api = useApi();
const memberModal = useOverlay().create(MemberModal);
const state = reactive({ name: "" });
const error = ref("");
const busy = ref(false);

function status(m: Member) {
  if (m.isMe) return t(m.isOwner ? "people.youOwner" : "you");
  if (!m.claimed) return t("people.notJoined");
  return m.email ? t("people.joinedEmail", { email: m.email }) : t("people.joined");
}

async function add() {
  error.value = "";
  busy.value = true;
  try {
    await api(`/groups/${props.data.group.id}/members`, { method: "POST", body: { name: state.name.trim() } });
    state.name = "";
    emit("changed");
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    busy.value = false;
  }
}

async function edit(member: Member) {
  if (await memberModal.open({ groupId: props.data.group.id, member }).result) emit("changed");
}
</script>
