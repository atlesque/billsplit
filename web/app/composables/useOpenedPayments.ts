const STORAGE_KEY = "bs_pay_opened";
const MAX_AGE = 30 * 24 * 60 * 60 * 1000;

/** Debts whose pay dialog this browser has opened (key -> when), so the next visit offers "Mark as paid" instead of Pay. */
const opened = ref<Record<string, number> | null>(null);

function load(): Record<string, number> {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, number>;
    const cutoff = Date.now() - MAX_AGE;
    return Object.fromEntries(Object.entries(stored).filter(([, at]) => at > cutoff));
  } catch {
    return {};
  }
}

function save(value: Record<string, number>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Private mode or blocked storage: it only lasts for this visit.
  }
}

export function useOpenedPayments() {
  opened.value ??= load();
  // The amount is part of the key, so a debt that changed asks for Pay again.
  const key = (groupId: string, s: Settlement) => `${groupId}:${s.from}:${s.to}:${s.amount}`;
  return {
    isOpened: (groupId: string, s: Settlement) => key(groupId, s) in opened.value!,
    markOpened(groupId: string, s: Settlement) {
      opened.value = { ...opened.value, [key(groupId, s)]: Date.now() };
      save(opened.value);
    },
    forget(groupId: string, s: Settlement) {
      const { [key(groupId, s)]: _, ...rest } = opened.value!;
      opened.value = rest;
      save(rest);
    },
  };
}
