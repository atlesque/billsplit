import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";

// wrangler.jsonc only has whole-line comments.
const config = JSON.parse(
  readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n"),
);
const staging = config.env.staging;

test("production never turns on staging mode or the test-user sign-in", () => {
  assert.equal(config.vars.STAGING, undefined);
  assert.equal(config.vars.DEV_DISABLE_ACCESS, undefined);
});

test("staging has its own hostname, database and bucket, behind Access", () => {
  assert.equal(staging.vars.STAGING, "true");
  assert.ok(staging.vars.ACCESS_TEAM_DOMAIN);
  assert.equal(staging.vars.APP_URL, `https://${staging.routes[0].pattern}`);
  assert.notEqual(staging.routes[0].pattern, config.routes[0].pattern);
  assert.notEqual(staging.d1_databases[0].database_id, config.d1_databases[0].database_id);
  assert.notEqual(staging.r2_buckets[0].bucket_name, config.r2_buckets[0].bucket_name);
});

test("the staging seed applies on top of the migrations, twice", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const dir = new URL("../migrations/", import.meta.url);
  for (const file of readdirSync(dir).sort()) db.exec(readFileSync(new URL(file, dir), "utf8"));
  const seed = readFileSync(new URL("../seed/staging.sql", import.meta.url), "utf8");
  db.exec(seed);
  db.exec(seed);

  // The test-user sign-in (src/mock-auth.ts) only accepts @billsplit.test accounts.
  const users = db.prepare("SELECT email FROM users").all() as { email: string }[];
  assert.ok(users.length >= 3);
  for (const { email } of users) assert.ok(email.endsWith("@billsplit.test"), email);

  // Every seeded expense's shares add up to its amount, as the app guarantees.
  const off = db
    .prepare(
      `SELECT e.id FROM expenses e JOIN expense_shares s ON s.expense_id = e.id
       GROUP BY e.id HAVING SUM(s.amount_cents) != e.amount_cents`,
    )
    .all();
  assert.deepEqual(off, []);
});
