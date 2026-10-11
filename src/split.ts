// Pure money math, shared by the API and the tests. All amounts are integer cents.

export type SplitMode = "equal" | "shares" | "amounts";

/** Resolves per-member weights into cent amounts that always sum exactly to `total`. */
export function resolveShares(total: number, mode: SplitMode, weights: Map<string, number>): Map<string, number> {
  const entries = [...weights].filter(([, w]) => w > 0);
  if (entries.length === 0) throw new Error("Pick at least one person to split with");

  if (mode === "amounts") {
    const sum = entries.reduce((acc, [, w]) => acc + w, 0);
    if (sum !== total) throw new Error("The amounts per person must add up to the total");
    return new Map(entries);
  }

  const weightSum = entries.reduce((acc, [, w]) => acc + (mode === "equal" ? 1 : w), 0);
  const raw = entries.map(([id, w]) => {
    const exact = (total * (mode === "equal" ? 1 : w)) / weightSum;
    return { id, base: Math.floor(exact), frac: exact - Math.floor(exact) };
  });
  // Hand the leftover cents to the largest fractional parts (ties: input order), so the split is fair and stable.
  let leftover = total - raw.reduce((acc, r) => acc + r.base, 0);
  const order = raw.map((r, i) => ({ i, frac: r.frac })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (leftover <= 0) break;
    raw[i].base += 1;
    leftover -= 1;
  }
  return new Map(raw.map((r) => [r.id, r.base]));
}

export type Movement = { paidBy: string; amount: number; shares: { memberId: string; amount: number }[] };

/** Net balance per member: positive means the group owes them money. */
export function balances(memberIds: string[], movements: Movement[]): Map<string, number> {
  const result = new Map(memberIds.map((id) => [id, 0]));
  for (const m of movements) {
    result.set(m.paidBy, (result.get(m.paidBy) ?? 0) + m.amount);
    for (const s of m.shares) result.set(s.memberId, (result.get(s.memberId) ?? 0) - s.amount);
  }
  return result;
}

export type Settlement = { from: string; to: string; amount: number };

/** Greedy minimal-ish set of payments that brings every balance to zero. */
export function settle(balanceMap: Map<string, number>): Settlement[] {
  const creditors = [...balanceMap].filter(([, b]) => b > 0).map(([id, b]) => ({ id, b }));
  const debtors = [...balanceMap].filter(([, b]) => b < 0).map(([id, b]) => ({ id, b: -b }));
  const result: Settlement[] = [];
  while (creditors.length && debtors.length) {
    creditors.sort((a, b) => b.b - a.b);
    debtors.sort((a, b) => b.b - a.b);
    const c = creditors[0];
    const d = debtors[0];
    const amount = Math.min(c.b, d.b);
    result.push({ from: d.id, to: c.id, amount });
    c.b -= amount;
    d.b -= amount;
    if (c.b === 0) creditors.shift();
    if (d.b === 0) debtors.shift();
  }
  return result;
}
