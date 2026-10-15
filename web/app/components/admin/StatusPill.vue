<template>
  <UBadge :color="color" variant="subtle" size="sm" :label="label" />
</template>

<script setup lang="ts">
const props = defineProps<{ status?: string | null }>();
const { t, te } = useI18n();
const COLORS: Record<string, "success" | "warning" | "error"> = { verified: "success", used: "success", sent: "success", active: "warning", pending: "warning", failed: "error", locked: "error" };
const color = computed(() => (props.status ? (COLORS[props.status] ?? "neutral") : "neutral"));
const label = computed(() => (!props.status ? "—" : te(`status.${props.status}`) ? t(`status.${props.status}`) : props.status));
</script>
