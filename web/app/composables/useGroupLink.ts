/** The group's one share link, e.g. dropped into a group chat. */
export function useGroupLink(group: () => Group) {
  const { t } = useI18n();
  const url = computed(() => (group().shareToken ? `${window.location.origin}/join/${group().shareToken}` : ""));
  const canShare = typeof navigator !== "undefined" && "share" in navigator;
  function share() {
    navigator.share({ title: group().name, text: t("link.shareText", { name: group().name }), url: url.value }).catch(() => {});
  }
  return { url, canShare, share };
}
