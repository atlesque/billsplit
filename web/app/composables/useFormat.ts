/** Locale-aware money and date formatting that follows the language switcher. */
export function useFormat() {
  const { locale, t } = useI18n();
  // Dutch formatting for Dutch, the browser's own English variant for English.
  const intlLocale = computed(() => {
    if (locale.value === "nl") return "nl-NL";
    const browser = typeof navigator === "undefined" ? "" : navigator.language ?? "";
    return browser.toLowerCase().startsWith("en") ? browser : "en";
  });

  const money = (cents: number, currency: string) => {
    try {
      return new Intl.NumberFormat(intlLocale.value, { style: "currency", currency }).format(cents / 100);
    } catch {
      return `${(cents / 100).toFixed(2)} ${currency}`;
    }
  };
  const formatDate = (iso: string) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString(intlLocale.value, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const formatTime = (ms: number | null | undefined) =>
    ms ? new Date(ms).toLocaleString(intlLocale.value, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
  const peopleCount = (count: number) => t("peopleCount", count);

  return { money, formatDate, formatTime, peopleCount };
}
