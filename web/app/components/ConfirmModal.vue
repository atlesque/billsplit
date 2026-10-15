<template>
  <UModal :title="title" :description="description" :close="false" :dismissible="true" @update:open="(open) => !open && emit('close', false)">
    <template #body>
      <UFormField v-if="requireText" :label="textLabel">
        <UInput v-model="typed" class="w-full" autofocus @keydown.enter="confirm" />
      </UFormField>
    </template>
    <template #footer>
      <div class="flex w-full flex-wrap justify-end gap-2">
        <UButton color="neutral" variant="ghost" :label="$t('action.cancel')" @click="emit('close', false)" />
        <UButton :color="color" :label="confirmLabel" :disabled="!!requireText && typed.trim() !== requireText" @click="confirm" />
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{ title: string; description?: string; confirmLabel: string; color?: "error" | "primary"; requireText?: string; textLabel?: string }>(),
  { color: "error", description: undefined, requireText: undefined, textLabel: undefined },
);
const emit = defineEmits<{ close: [confirmed: boolean] }>();
const typed = ref("");
function confirm() {
  if (props.requireText && typed.value.trim() !== props.requireText) return;
  emit("close", true);
}
</script>
