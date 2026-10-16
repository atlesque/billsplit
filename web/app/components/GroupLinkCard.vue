<template>
  <UCard class="mb-4 ring-primary" :class="{ 'ring-2': !compact }">
    <h2 class="text-lg font-semibold text-highlighted">{{ $t("link.inviteTitle", { name: group.name }) }}</h2>
    <p class="mt-1 mb-3 text-sm text-muted">{{ $t("link.inviteHelp") }}</p>
    <div class="flex flex-wrap gap-2">
      <UInput :model-value="url" readonly :aria-label="$t('link.groupLink')" class="min-w-56 flex-1" @focus="($event.target as HTMLInputElement).select()" />
      <UButton icon="i-lucide-copy" :label="$t('link.copy')" @click="copy(url)" />
      <UButton v-if="canShare" color="neutral" variant="outline" icon="i-lucide-share-2" :label="$t('link.share')" @click="share" />
    </div>
    <UButton v-if="compact && group.canManage" class="mt-2 -ms-2.5" color="error" variant="link" size="sm" icon="i-lucide-rotate-ccw" :label="$t('link.reset')" @click="reset" />
  </UCard>
</template>

<script setup lang="ts">
import { ConfirmModal } from "#components";

const props = defineProps<{ group: Group; compact?: boolean }>();
const emit = defineEmits<{ changed: [] }>();
const { t } = useI18n();
const api = useApi();
const toast = useToast();
const copy = useCopy();
const confirmModal = useOverlay().create(ConfirmModal);
const { url, canShare, share } = useGroupLink(() => props.group);

async function reset() {
  const ok = await confirmModal.open({ title: t("link.reset"), description: t("link.resetConfirm"), confirmLabel: t("link.reset") }).result;
  if (!ok) return;
  try {
    await api(`/groups/${props.group.id}/invites/reset`, { method: "POST" });
    toast.add({ title: t("link.resetDone"), color: "success" });
    emit("changed");
  } catch (err) {
    toast.add({ title: (err as Error).message, color: "error" });
  }
}
</script>
