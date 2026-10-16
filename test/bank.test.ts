import assert from "node:assert/strict";
import { test } from "node:test";
import { compact, epcPayload, formatIban, ibanProblem, isBic } from "../src/bank.ts";

test("accepts valid SEPA IBANs, with or without spaces", () => {
  for (const iban of [
    "BE71 0961 2345 6769",
    "nl91abna0417164300",
    "DE89 3704 0044 0532 0130 00",
    "FR14 2004 1010 0505 0001 3M02 606",
    "GB29 NWBK 6016 1331 9268 19",
    "CH93 0076 2011 6238 5295 7",
    "NO93 8601 1117 947",
  ]) {
    assert.equal(ibanProblem(compact(iban)), null, iban);
  }
});

test("explains why an IBAN is refused", () => {
  assert.equal(ibanProblem(compact("BE71 0961 2345 6768")), "checksum");
  assert.equal(ibanProblem(compact("BE71 0961 2345 676")), "length");
  assert.equal(ibanProblem(compact("BR18 0036 0305 0000 1000 9795 493C 1")), "country");
  assert.equal(ibanProblem(compact("0961 2345 6769")), "format");
  assert.equal(ibanProblem(""), "format");
});

test("formats IBANs in groups of four", () => {
  assert.equal(formatIban("be71096123456769"), "BE71 0961 2345 6769");
});

test("checks BICs", () => {
  assert.ok(isBic("GKCCBEBB"));
  assert.ok(isBic("KREDBEBB"));
  assert.ok(isBic("ABNANL2AXXX"));
  assert.ok(!isBic("GKCCBE"));
  assert.ok(!isBic("GKCC1EBB"));
});

test("builds an EPC QR payload (version 002, BIC optional)", () => {
  assert.equal(
    epcPayload({ name: "Alex Doe", iban: "BE71 0961 2345 6769", amountCents: 1250, text: "BillSplit: Lisbon trip" }),
    ["BCD", "002", "1", "SCT", "", "Alex Doe", "BE71096123456769", "EUR12.50", "", "", "BillSplit: Lisbon trip"].join("\n"),
  );
  const withBic = epcPayload({ name: "A".repeat(90), iban: "BE71096123456769", bic: "gkcc bebb", amountCents: 5, text: "x".repeat(200) });
  const lines = withBic.split("\n");
  assert.equal(lines[4], "GKCCBEBB");
  assert.equal(lines[5].length, 70);
  assert.equal(lines[7], "EUR0.05");
  assert.equal(lines[10].length, 140);
  assert.ok(new TextEncoder().encode(withBic).length <= 331);
});
