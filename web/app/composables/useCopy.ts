export function useCopy() {
  const toast = useToast();
  const { t } = useI18n();
  return async function copy(text: string, message = t("link.copied")) {
    try {
      await navigator.clipboard.writeText(text);
      toast.add({ title: message, icon: "i-lucide-copy-check", color: "success" });
    } catch {
      toast.add({ title: text, color: "neutral" });
    }
  };
}
