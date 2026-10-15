import assert from "node:assert/strict";
import { test } from "node:test";
// @ts-ignore: plain JS module served to the browser
import { DICTIONARIES, matchLanguage, t } from "../public/i18n.js";
import { HttpError } from "../src/http.ts";
import { dictionary, requestLang, tr } from "../src/i18n.ts";

const placeholders = (value: unknown) =>
  [...JSON.stringify(value).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

test("front end: Dutch has every English key with the same placeholders", () => {
  const { en, nl } = DICTIONARIES as Record<string, Record<string, unknown>>;
  assert.deepEqual(Object.keys(nl).sort(), Object.keys(en).sort());
  for (const key of Object.keys(en)) assert.equal(placeholders(nl[key]), placeholders(en[key]), key);
});

test("front end: fills placeholders and picks plural forms", () => {
  assert.equal(t("expense.amount", { currency: "EUR" }, "nl"), "Bedrag (EUR)");
  assert.equal(t("people", { count: 1 }, "en"), "1 person");
  assert.equal(t("people", { count: 3 }, "nl"), "3 personen");
  assert.equal(t("no.such.key", {}, "nl"), "no.such.key");
});

test("front end: matches browser languages by their base language", () => {
  assert.equal(matchLanguage(["nl-BE", "en-US"]), "nl");
  assert.equal(matchLanguage(["de-DE", "en-GB"]), "en");
  assert.equal(matchLanguage(["fr"]), null);
});

test("server: Dutch translations keep the English placeholders", () => {
  for (const [en, nl] of Object.entries(dictionary("nl"))) assert.equal(placeholders(nl), placeholders(en), en);
});

test("server: picks the language from ?lang, then Accept-Language", () => {
  const req = (url: string, accept?: string) => new Request(url, { headers: accept ? { "Accept-Language": accept } : {} });
  assert.equal(requestLang(req("https://x/api", "nl-NL,nl;q=0.9,en;q=0.8")), "nl");
  assert.equal(requestLang(req("https://x/api", "de-DE,en;q=0.5,nl;q=0.7")), "nl");
  assert.equal(requestLang(req("https://x/api", "fr-FR")), "en");
  assert.equal(requestLang(req("https://x/api")), "en");
  assert.equal(requestLang(req("https://x/api?lang=nl", "en")), "nl");
});

test("server: errors keep English text and translate from their template", () => {
  const error = new HttpError(400, "{field} is too long (max {max} characters)", { field: "Name", max: 60 });
  assert.equal(error.message, "Name is too long (max 60 characters)");
  assert.equal(tr("nl", error.template, { ...error.params, field: tr("nl", "Name") }), "Naam is te lang (max. 60 tekens)");
});
