import assert from "node:assert/strict";
import { test } from "node:test";
import { balances, resolveShares, settle } from "../src/split.ts";

const w = (entries: [string, number][]) => new Map(entries);
const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);

test("equal split hands out leftover cents and sums exactly", () => {
  const r = resolveShares(1000, "equal", w([["a", 1], ["b", 1], ["c", 1]]));
  assert.equal(sum(r), 1000);
  assert.deepEqual([...r.values()].sort(), [333, 333, 334]);
});

test("shares split is proportional", () => {
  const r = resolveShares(1000, "shares", w([["a", 1], ["b", 3]]));
  assert.deepEqual(Object.fromEntries(r), { a: 250, b: 750 });
});

test("zero weights are excluded", () => {
  const r = resolveShares(500, "shares", w([["a", 0], ["b", 2]]));
  assert.deepEqual(Object.fromEntries(r), { b: 500 });
});

test("amounts must add up", () => {
  assert.throws(() => resolveShares(1000, "amounts", w([["a", 400], ["b", 500]])));
  assert.deepEqual(Object.fromEntries(resolveShares(900, "amounts", w([["a", 400], ["b", 500]]))), { a: 400, b: 500 });
});

test("no participants throws", () => {
  assert.throws(() => resolveShares(100, "equal", w([["a", 0]])));
});

test("balances and settlements zero out", () => {
  const b = balances(["a", "b", "c"], [
    { paidBy: "a", amount: 900, shares: [{ memberId: "a", amount: 300 }, { memberId: "b", amount: 300 }, { memberId: "c", amount: 300 }] },
    { paidBy: "b", amount: 300, shares: [{ memberId: "c", amount: 300 }] },
  ]);
  assert.deepEqual(Object.fromEntries(b), { a: 600, b: 0, c: -600 });
  assert.deepEqual(settle(b), [{ from: "c", to: "a", amount: 600 }]);

  const s = settle(new Map([["a", 500], ["b", 300], ["c", -200], ["d", -600]]));
  const after = new Map([["a", 500], ["b", 300], ["c", -200], ["d", -600]]);
  for (const p of s) {
    after.set(p.from, after.get(p.from)! + p.amount);
    after.set(p.to, after.get(p.to)! - p.amount);
  }
  assert.ok([...after.values()].every((v) => v === 0));
  assert.ok(s.length <= 3);
});
