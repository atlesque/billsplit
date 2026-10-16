/** Locale-aware money and date formatting that follows the language switcher. */
export function useFormat() {
  const { locale, t } = useI18n();
  // Dutch formatting for Dutch, the browser's own English variant for English.
  const intlLocale = computed(() => {
    if (locale.value === "nl") return "nl-NL";
    const browser = typeof navigator === "undefined" ? "" : navigator.language ?? "";
    if (!browser.toLowerCase().startsWith("en")) return "en";
    // Some browsers report tags Intl rejects (e.g. "en-US@posix").
    try {
      return Intl.getCanonicalLocales(browser)[0] ?? "en";
    } catch {
      return "en";
    }
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
  // The decimal mark amounts are shown with, so amount fields can use the same one.
  const decimal = computed(() => new Intl.NumberFormat(intlLocale.value).formatToParts(1.5).find((p) => p.type === "decimal")?.value ?? ".");
  const amountInput = (cents: number) => centsToInput(cents, decimal.value);
  // Attributes for an amount field: a "0,00" placeholder and dot-to-comma typing where commas are the norm.
  const amountField = computed(() => ({
    inputmode: "decimal" as const,
    placeholder: centsToInput(0, decimal.value),
    ...(decimal.value === "," ? { onInput: dotToComma } : {}),
  }));
  const peopleCount = (count: number) => t("peopleCount", count);
  const fileSize = (bytes: number) => {
    const [value, unit] = bytes < 1024 * 1024 ? [Math.max(1, Math.round(bytes / 1024)), "kilobyte"] : [bytes / 1024 / 1024, "megabyte"];
    return new Intl.NumberFormat(intlLocale.value, { style: "unit", unit, unitDisplay: "short", maximumFractionDigits: 1 }).format(value);
  };

  return { money, formatDate, formatTime, peopleCount, amountInput, amountField, fileSize };
}
