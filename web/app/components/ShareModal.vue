<template>
  <UModal :title="title ?? $t('share.created')">
    <template #body>
      <i18n-t keypath="share.help" tag="p" class="mb-4" scope="global">
        <template #name><strong>{{ group.name }}</strong></template>
      </i18n-t>
      <p v-if="group.locked" class="mb-4 text-sm text-muted">{{ $t("link.lockedHelp") }}</p>
      <UInput :model-value="url" readonly :aria-label="$t('link.groupLink')" class="w-full" @focus="($event.target as HTMLInputElement).select()" />
    </template>
    <template #footer>
      <div class="flex w-full flex-wrap gap-2">
        <UButton icon="i-lucide-copy" :label="$t('link.copy')" @click="copy(url)" />
        <UButton v-if="canShare" color="neutral" variant="outline" icon="i-lucide-share-2" :label="$t('link.share')" @click="share" />
        <UButton class="ms-auto" color="neutral" variant="ghost" :label="$t('action.done')" @click="emit('close')" />
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
const props = defineProps<{ group: Group; title?: string }>();
const emit = defineEmits<{ close: [] }>();
const copy = useCopy();
const { url, canShare, share } = useGroupLink(() => props.group);
</script>
