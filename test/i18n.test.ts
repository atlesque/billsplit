import assert from "node:assert/strict";
import { test } from "node:test";
import { HttpError } from "../src/http.ts";
import { dictionary, requestLang, tr } from "../src/i18n.ts";
import en from "../web/i18n/locales/en.json" with { type: "json" };
import nl from "../web/i18n/locales/nl.json" with { type: "json" };

const placeholders = (value: unknown) =>
  [...JSON.stringify(value).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

/** { a: { b: "x" } } -> { "a.b": "x" } */
const flatten = (obj: object, prefix = ""): Record<string, string> =>
  Object.assign({}, ...Object.entries(obj).map(([k, v]) => (typeof v === "string" ? { [prefix + k]: v } : flatten(v, `${prefix}${k}.`))));

test("front end: Dutch has every English key with the same placeholders and plural forms", () => {
  const enFlat = flatten(en);
  const nlFlat = flatten(nl);
  assert.deepEqual(Object.keys(nlFlat).sort(), Object.keys(enFlat).sort());
  for (const key of Object.keys(enFlat)) {
    assert.equal(placeholders(nlFlat[key]), placeholders(enFlat[key]), key);
    assert.equal(nlFlat[key].split(" | ").length, enFlat[key].split(" | ").length, key);
  }
});

test("front end: messages avoid vue-i18n syntax characters", () => {
  // @ starts a linked message and | separates plural forms (only used as " | ").
  for (const [key, value] of Object.entries({ ...flatten(en), ...flatten(nl) })) {
    assert.doesNotMatch(value.replaceAll(" | ", ""), /[@|$%<>]/, key);
  }
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
