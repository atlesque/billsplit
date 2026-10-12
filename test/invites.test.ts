import assert from "node:assert/strict";
import { test } from "node:test";
import { maskPath } from "../src/http.ts";
import { inviteStatus } from "../src/invite-status.ts";

test("invite status: used wins, then revoked, then expired", () => {
  const at = 1_000;
  assert.equal(inviteStatus({ used_at: null, revoked_at: null, expires_at: 2_000 }, at), "active");
  assert.equal(inviteStatus({ used_at: 500, revoked_at: null, expires_at: 2_000 }, at), "used");
  assert.equal(inviteStatus({ used_at: null, revoked_at: 500, expires_at: 2_000 }, at), "revoked");
  assert.equal(inviteStatus({ used_at: null, revoked_at: null, expires_at: 1_000 }, at), "expired");
});

test("maskPath hides invite tokens only", () => {
  assert.equal(maskPath("/join/Gscqg51txMG3rwZ9LpdQNfiX"), "/join/Gscq…");
  assert.equal(maskPath("/"), "/");
  assert.equal(maskPath("/g/abc?tab=people"), "/g/abc?tab=people");
});
