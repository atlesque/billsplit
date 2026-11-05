import assert from "node:assert/strict";
import { test } from "node:test";
import { maskPath } from "../src/http.ts";
import { paymentLinkState } from "../src/payment-link.ts";

const at = 1_800_000_000_000;
const payment = (over: Partial<{ status: string; to_user: string | null; confirm_expires_at: number }> = {}) => ({
  status: "sent",
  to_user: "alex",
  confirm_expires_at: at + 1000,
  ...over,
});

test("payment link: open for the recipient while it hasn't expired", () => {
  assert.equal(paymentLinkState(payment(), "alex", at), "open");
  assert.equal(paymentLinkState(payment({ status: "not_received" }), "alex", at), "open");
});

test("payment link: only works for the account the payment went to", () => {
  assert.equal(paymentLinkState(payment(), "bob", at), "wrong_account");
  // Someone else's link never reveals whether the payment was confirmed.
  assert.equal(paymentLinkState(payment({ status: "received" }), "bob", at), "wrong_account");
  // A recipient without an account (or who left) can't be anyone signed in.
  assert.equal(paymentLinkState(payment({ to_user: null }), "alex", at), "wrong_account");
});

test("payment link: expires, and unknown or cancelled links read as expired", () => {
  assert.equal(paymentLinkState(payment({ confirm_expires_at: at }), "alex", at), "expired");
  assert.equal(paymentLinkState(null, "alex", at), "expired");
});

test("payment link: already confirmed or failed wins over expiry", () => {
  assert.equal(paymentLinkState(payment({ status: "received" }), "alex", at), "confirmed");
  assert.equal(paymentLinkState(payment({ status: "received", confirm_expires_at: at - 1 }), "alex", at), "confirmed");
  assert.equal(paymentLinkState(payment({ status: "failed", confirm_expires_at: at - 1 }), "alex", at), "failed");
});

test("payment link: tokens are masked in logged paths", () => {
  assert.equal(maskPath("/confirm-payment/abcdefghijklmnopqrstuvwx"), "/confirm-payment/abcd…");
  assert.equal(maskPath("/join/abcdefghijkl"), "/join/abcd…");
});
