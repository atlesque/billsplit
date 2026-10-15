import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalUrl } from "../src/page-meta.ts";

test("canonical URL is the app origin plus the path", () => {
  assert.equal(canonicalUrl("https://billsplit.atlesque.dev", "/join/abc123"), "https://billsplit.atlesque.dev/join/abc123");
  assert.equal(canonicalUrl("https://billsplit.atlesque.dev", "/"), "https://billsplit.atlesque.dev/");
});
