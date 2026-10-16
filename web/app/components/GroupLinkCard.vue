<template>
  <UCard class="mb-4 ring-primary" :class="{ 'ring-2': !compact }">
    <h2 class="text-lg font-semibold text-highlighted">{{ $t("link.inviteTitle", { name: group.name }) }}</h2>
    <p class="mt-1 mb-3 text-sm text-muted">{{ $t(group.locked ? "link.lockedHelp" : "link.inviteHelp") }}</p>
    <div class="flex flex-wrap gap-2">
      <UInput :model-value="url" readonly :aria-label="$t('link.groupLink')" class="min-w-56 flex-1" @focus="($event.target as HTMLInputElement).select()" />
      <UButton icon="i-lucide-copy" :label="$t('link.copy')" @click="copy(url)" />
      <UButton v-if="canShare" color="neutral" variant="outline" icon="i-lucide-share-2" :label="$t('link.share')" @click="share" />
    </div>
    <USwitch
      v-if="compact && group.canManage"
      class="mt-4"
      :model-value="group.locked"
      :label="$t('link.lock')"
      :description="$t('link.lockHelp')"
      :loading="busy"
      :disabled="busy"
      @update:model-value="setLocked"
    />
  </UCard>
</template>

<script setup lang="ts">
const props = defineProps<{ group: Group; compact?: boolean }>();
const emit = defineEmits<{ changed: [] }>();
const { t } = useI18n();
const api = useApi();
const toast = useToast();
const copy = useCopy();
const { url, canShare, share } = useGroupLink(() => props.group);
const busy = ref(false);

async function setLocked(locked: boolean) {
  busy.value = true;
  try {
    await api(`/groups/${props.group.id}/lock`, { method: locked ? "POST" : "DELETE" });
    toast.add({ title: t(locked ? "link.lockedDone" : "link.unlockedDone"), color: "success" });
    emit("changed");
  } catch (err) {
    toast.add({ title: (err as Error).message, color: "error" });
  } finally {
    busy.value = false;
  }
}
</script>
