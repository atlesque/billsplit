<template>
  <UModal :title="$t('tab.settings')" :ui="{ content: 'sm:max-w-xl' }">
    <template #body>
      <GroupSettings :data="data" @changed="onChanged" />
    </template>
  </UModal>
</template>

<script setup lang="ts">
/** The group's settings, opened from the cogwheel next to the group name. Read-only details for everyone but the owner. */
defineProps<{ data: GroupData; onChanged: () => void }>();
const emit = defineEmits<{ close: [] }>();
// Leaving or deleting the group goes back to the home page; don't leave the dialog open over it.
const route = useRoute();
watch(() => route.path, () => emit("close"));
</script>
