<template>
  <!-- Always dark on white with a quiet zone, whatever the theme, so banking apps can scan it. -->
  <svg :viewBox="`0 0 ${qr.size} ${qr.size}`" class="block rounded-md bg-white" shape-rendering="crispEdges" role="img" :aria-label="label">
    <path :d="path" fill="#000" />
  </svg>
</template>

<script setup lang="ts">
import { encode } from "uqr";

const props = defineProps<{ value: string; label: string }>();
// Error correction level M, as the EPC QR code standard asks for.
const qr = computed(() => encode(props.value, { ecc: "M", border: 4 }));
const path = computed(() => {
  let d = "";
  qr.value.data.forEach((row, y) => row.forEach((dark, x) => dark && (d += `M${x} ${y}h1v1h-1z`)));
  return d;
});
</script>
