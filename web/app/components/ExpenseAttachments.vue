<template>
  <div v-if="editable || attachments.length">
    <p class="mb-1.5 text-sm font-medium text-default">{{ $t("attachments.title") }}</p>
    <ul v-if="attachments.length || pending.length" class="mb-2 divide-y divide-default rounded-md border border-default">
      <li v-for="a in attachments" :key="a.id" class="flex min-h-10 items-center gap-2 px-3 py-1.5">
        <UIcon :name="icon(a.contentType)" class="size-4 shrink-0 text-muted" />
        <!-- Opens in a new tab; the Worker only serves it to the group's members. -->
        <a :href="url(a)" target="_blank" rel="noopener" class="min-w-0 flex-1 truncate text-sm font-medium text-primary hover:underline">{{ a.name }}</a>
        <span class="shrink-0 text-xs text-muted tabular-nums">{{ fileSize(a.size) }}</span>
        <UButton
          v-if="editable"
          icon="i-lucide-x"
          size="xs"
          color="neutral"
          variant="ghost"
          :loading="busyId === a.id"
          :aria-label="$t('attachments.remove', { name: a.name })"
          @click="remove(a)"
        />
      </li>
      <li v-for="(f, i) in pending" :key="`${f.name}-${i}`" class="flex min-h-10 items-center gap-2 px-3 py-1.5">
        <UIcon :name="icon(f.type)" class="size-4 shrink-0 text-muted" />
        <span class="min-w-0 flex-1 truncate text-sm">{{ f.name }}</span>
        <span class="shrink-0 text-xs text-muted">{{ $t("attachments.pending") }}</span>
        <UButton icon="i-lucide-x" size="xs" color="neutral" variant="ghost" :aria-label="$t('attachments.remove', { name: f.name })" @click="pending.splice(i, 1)" />
      </li>
    </ul>
    <template v-if="editable">
      <input ref="input" type="file" class="hidden" multiple :accept="ACCEPT" @change="pick" />
      <UButton icon="i-lucide-paperclip" size="sm" color="neutral" variant="outline" :label="$t('attachments.add')" :loading="uploading" @click="input?.click()" />
      <p class="mt-1 text-xs text-muted">{{ $t("attachments.help") }}</p>
    </template>
  </div>
</template>

<script setup lang="ts">
// Listing image/jpeg (not image/*) makes iPhones hand over a JPEG instead of a HEIC photo.
const ACCEPT = "application/pdf,image/jpeg,image/png,image/webp,image/gif";
const MAX_BYTES = 10 * 1024 * 1024;

const props = defineProps<{ groupId: string; expenseId: string | null; editable: boolean }>();
const attachments = defineModel<Attachment[]>("attachments", { required: true });
/** Files picked for an expense that doesn't exist yet; the modal uploads them once it's saved. */
const pending = defineModel<File[]>("pending", { required: true });
const emit = defineEmits<{ changed: [] }>();
const { t } = useI18n();
const api = useApi();
const toast = useToast();
const { fileSize } = useFormat();

const input = ref<HTMLInputElement>();
const uploading = ref(false);
const busyId = ref("");

const icon = (type: string) => (type === "application/pdf" ? "i-lucide-file-text" : "i-lucide-image");
const url = (a: Attachment) => `/api/groups/${props.groupId}/attachments/${a.id}`;

async function pick() {
  const files = [...(input.value?.files ?? [])];
  if (input.value) input.value.value = "";
  const ok = files.filter((f) => {
    if (f.size <= MAX_BYTES) return true;
    toast.add({ title: t("attachments.tooBig", { name: f.name }), color: "error" });
    return false;
  });
  if (!props.expenseId) return pending.value.push(...ok);
  uploading.value = true;
  for (const file of ok) {
    try {
      attachments.value = [...attachments.value, await uploadAttachment(api, props.groupId, props.expenseId, file)];
      emit("changed");
    } catch (err) {
      toast.add({ title: t("attachments.uploadFailed", { name: file.name, error: (err as Error).message }), color: "error" });
    }
  }
  uploading.value = false;
}

async function remove(a: Attachment) {
  busyId.value = a.id;
  try {
    await api(`/groups/${props.groupId}/attachments/${a.id}`, { method: "DELETE" });
    attachments.value = attachments.value.filter((x) => x.id !== a.id);
    emit("changed");
  } catch (err) {
    toast.add({ title: (err as Error).message, color: "error" });
  } finally {
    busyId.value = "";
  }
}
</script>
