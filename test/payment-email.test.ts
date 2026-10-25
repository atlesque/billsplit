import assert from "node:assert/strict";
import { test } from "node:test";
import { tr, type Lang } from "../src/i18n.ts";
import { formatAmount, paymentEmailHtml, paymentEmailText } from "../src/payment-email.ts";

const t = (lang: Lang) => (text: string, params?: Record<string, string | number>) => tr(lang, text, params);

const params = { from: "Bob", to: "Alex", amount: "€12.50", group: "Ski trip" };

test("payment emails: English and Dutch text for both kinds", () => {
  assert.equal(paymentEmailText("payment_sent", t("en"), params).subject, "Bob sent you €12.50");
  assert.equal(paymentEmailText("payment_received", t("en"), params).subject, "Alex received your €12.50");
  assert.equal(paymentEmailText("payment_sent", t("nl"), params).subject, "Bob heeft je €12.50 gestuurd");
  assert.match(paymentEmailText("payment_received", t("nl"), params).intro, /^Alex heeft bevestigd .* Ski trip/);
});

test("payment emails: names never break the subject line", () => {
  const { subject } = paymentEmailText("payment_sent", t("en"), { ...params, from: "Bob\r\nBcc: x@y.z" });
  assert.doesNotMatch(subject, /[\r\n]/);
});

test("payment emails: names are escaped in the HTML", () => {
  const html = paymentEmailHtml("en", "<b>Bob</b> & co", "Open", "https://x/g/1?a=1&b=2", "footer");
  assert.doesNotMatch(html, /<b>Bob/);
  assert.match(html, /&lt;b&gt;Bob&lt;\/b&gt; &amp; co/);
  assert.match(html, /href="https:\/\/x\/g\/1\?a=1&amp;b=2"/);
});

test("payment emails: amounts use the reader's number format", () => {
  assert.equal(formatAmount(1250, "EUR", "en"), "€12.50");
  assert.equal(formatAmount(1250, "EUR", "nl"), "€\u00a012,50");
  assert.equal(formatAmount(1250, "XYZW", "en"), "12.50 XYZW");
});
