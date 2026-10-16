import assert from "node:assert/strict";
import { test } from "node:test";
import { centsToInput, dotToComma, parseAmount } from "../web/app/utils/money.ts";

test("amount fields show the locale's decimal mark", () => {
  assert.equal(centsToInput(1060), "10.60");
  assert.equal(centsToInput(1060, ","), "10,60");
  assert.equal(parseAmount(centsToInput(123456, ",")), 123456);
});

test("a typed dot becomes a comma and the cursor stays put", () => {
  const el = { value: "10.6", selectionStart: 3, selectionEnd: 3, setSelectionRange(a: number, b: number) { this.selectionStart = a; this.selectionEnd = b; } };
  dotToComma({ target: el } as unknown as Event);
  assert.equal(el.value, "10,6");
  assert.equal(el.selectionStart, 3);
  assert.equal(parseAmount(el.value), 1060);
});
