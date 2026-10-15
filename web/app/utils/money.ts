// Amounts are whole cents everywhere; these helpers convert to and from what people type.

/** "12,5" / "12.50" / "1 234,56" -> cents, or NaN. */
export function parseAmount(input: string | number): number {
  let s = String(input).trim().replace(/[\s']/g, "");
  if (!s) return NaN;
  const lastSep = Math.max(s.lastIndexOf(","), s.lastIndexOf("."));
  if (lastSep >= 0 && s.length - lastSep - 1 <= 2) {
    s = s.slice(0, lastSep).replace(/[.,]/g, "") + "." + s.slice(lastSep + 1);
  } else {
    s = s.replace(/[.,]/g, "");
  }
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return NaN;
  return Math.round(parseFloat(s) * 100);
}

export const centsToInput = (cents: number) => (cents / 100).toFixed(2);

export const initials = (name: string) =>
  String(name)
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("") || "?";

/** Today as YYYY-MM-DD in local time. */
export const today = () => new Date().toLocaleDateString("en-CA");

/** CSS class for a balance: positive is owed to you, negative you owe. */
export const tone = (n: number) => (n > 0 ? "pos" : n < 0 ? "neg" : "text-muted");

export const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "JPY", "CAD", "AUD", "SEK", "NOK", "DKK", "PLN", "CZK", "HUF", "CNY", "INR", "BRL", "MXN", "ZAR", "NZD", "SGD", "HKD", "THB", "TRY"];

// Categories are stored in English and translated for display; custom values show as typed.
export const CATEGORIES: Record<string, string> = {
  "Food & drinks": "food",
  Groceries: "groceries",
  Transport: "transport",
  Accommodation: "accommodation",
  Activities: "activities",
  Shopping: "shopping",
  Bills: "bills",
  Other: "other",
};
