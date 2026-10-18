-- Mock data for the staging database only. `pnpm run deploy` applies it after the staging
-- migrations on every deploy; INSERT OR IGNORE puts back missing rows without touching changed ones.
--
-- Test users sign in through the test-user picker (src/mock-auth.ts), which only accepts accounts
-- on the reserved @billsplit.test domain. alex@billsplit.test is an admin on staging.

INSERT OR IGNORE INTO users (id, email, name, created_at, bank_name, bank_iban, bank_bic) VALUES
  ('test-alex', 'alex@billsplit.test', 'Alex', 1790000000000, 'Alex Tester', 'BE71096123456769', 'GKCCBEBB'),
  ('test-bob', 'bob@billsplit.test', 'Bob', 1790000000000, 'Bob Tester', 'NL91ABNA0417164300', 'ABNANL2A'),
  ('test-cara', 'cara@billsplit.test', 'Cara', 1790000000000, '', '', ''),
  ('test-dana', 'dana@billsplit.test', 'Dana', 1790000000000, '', '', ''),
  -- Has no name yet, so signing in shows the name step.
  ('test-new', 'new@billsplit.test', '', 1790000000000, '', '', '');

INSERT OR IGNORE INTO groups (id, name, description, currency, invite_token, created_by, created_at, locked_at, archived_at, archived_by) VALUES
  ('test-ghent', 'Weekend in Ghent', 'City trip, 2 to 4 October', 'EUR', 'test-ghent-legacy-token', 'test-alex', 1790100000000, NULL, NULL, NULL),
  ('test-flat', 'Flat 3B', 'Shared costs at home', 'EUR', 'test-flat-legacy-token', 'test-cara', 1790100000000, 1790500000000, NULL, NULL),
  ('test-ski', 'Ski trip 2025', '', 'CHF', 'test-ski-legacy-token', 'test-bob', 1738000000000, NULL, 1740500000000, 'test-bob');

-- Dirk has no account: he was added by name.
INSERT OR IGNORE INTO members (id, group_id, name, user_id, created_at) VALUES
  ('test-ghent-alex', 'test-ghent', 'Alex', 'test-alex', 1790100000000),
  ('test-ghent-bob', 'test-ghent', 'Bob', 'test-bob', 1790100000000),
  ('test-ghent-cara', 'test-ghent', 'Cara', 'test-cara', 1790100000000),
  ('test-ghent-dirk', 'test-ghent', 'Dirk', NULL, 1790100000000),
  ('test-flat-cara', 'test-flat', 'Cara', 'test-cara', 1790100000000),
  ('test-flat-bob', 'test-flat', 'Bob', 'test-bob', 1790100000000),
  ('test-flat-dana', 'test-flat', 'Dana', 'test-dana', 1790100000000),
  ('test-flat-alex', 'test-flat', 'Alex', 'test-alex', 1790100000000),
  ('test-ski-bob', 'test-ski', 'Bob', 'test-bob', 1738000000000),
  ('test-ski-alex', 'test-ski', 'Alex', 'test-alex', 1738000000000);

INSERT OR IGNORE INTO expenses (id, group_id, kind, title, amount_cents, paid_by, spent_on, category, split_mode, created_by, created_at, updated_at) VALUES
  ('test-ghent-train', 'test-ghent', 'expense', 'Train tickets', 5400, 'test-ghent-cara', '2026-10-02', 'transport', 'shares', 'test-cara', 1790200000000, 1790200000000),
  ('test-ghent-hotel', 'test-ghent', 'expense', 'Hotel, 2 nights', 36000, 'test-ghent-alex', '2026-10-03', 'accommodation', 'equal', 'test-alex', 1790200000000, 1790200000000),
  ('test-ghent-dinner', 'test-ghent', 'expense', 'Dinner at the harbour', 9630, 'test-ghent-bob', '2026-10-03', 'food', 'equal', 'test-bob', 1790200000000, 1790200000000),
  ('test-ghent-museum', 'test-ghent', 'expense', 'Museum tickets', 4250, 'test-ghent-bob', '2026-10-04', 'activities', 'amounts', 'test-bob', 1790200000000, 1790200000000),
  ('test-flat-internet', 'test-flat', 'expense', 'Internet, October', 4000, 'test-flat-cara', '2026-10-01', 'bills', 'equal', 'test-cara', 1790300000000, 1790300000000),
  ('test-flat-groceries', 'test-flat', 'expense', 'Groceries', 8420, 'test-flat-dana', '2026-10-10', 'groceries', 'equal', 'test-dana', 1790300000000, 1790300000000),
  ('test-flat-cleaning', 'test-flat', 'expense', 'Cleaning supplies', 2360, 'test-flat-alex', '2026-10-12', 'shopping', 'equal', 'test-alex', 1790300000000, 1790300000000),
  ('test-ski-chalet', 'test-ski', 'expense', 'Chalet', 80000, 'test-ski-bob', '2025-02-10', 'accommodation', 'equal', 'test-bob', 1739000000000, 1739000000000),
  ('test-ski-payment', 'test-ski', 'transfer', 'Payment', 40000, 'test-ski-alex', '2025-02-20', '', 'equal', 'test-bob', 1740000000000, 1740000000000);

INSERT OR IGNORE INTO expense_shares (expense_id, member_id, weight, amount_cents) VALUES
  ('test-ghent-train', 'test-ghent-alex', 2, 1800),
  ('test-ghent-train', 'test-ghent-bob', 1, 900),
  ('test-ghent-train', 'test-ghent-cara', 1, 900),
  ('test-ghent-train', 'test-ghent-dirk', 2, 1800),
  ('test-ghent-hotel', 'test-ghent-alex', 1, 9000),
  ('test-ghent-hotel', 'test-ghent-bob', 1, 9000),
  ('test-ghent-hotel', 'test-ghent-cara', 1, 9000),
  ('test-ghent-hotel', 'test-ghent-dirk', 1, 9000),
  ('test-ghent-dinner', 'test-ghent-alex', 1, 3210),
  ('test-ghent-dinner', 'test-ghent-bob', 1, 3210),
  ('test-ghent-dinner', 'test-ghent-cara', 1, 3210),
  ('test-ghent-museum', 'test-ghent-alex', 1250, 1250),
  ('test-ghent-museum', 'test-ghent-bob', 1500, 1500),
  ('test-ghent-museum', 'test-ghent-cara', 1500, 1500),
  ('test-flat-internet', 'test-flat-cara', 1, 1000),
  ('test-flat-internet', 'test-flat-bob', 1, 1000),
  ('test-flat-internet', 'test-flat-dana', 1, 1000),
  ('test-flat-internet', 'test-flat-alex', 1, 1000),
  ('test-flat-groceries', 'test-flat-cara', 1, 2105),
  ('test-flat-groceries', 'test-flat-bob', 1, 2105),
  ('test-flat-groceries', 'test-flat-dana', 1, 2105),
  ('test-flat-groceries', 'test-flat-alex', 1, 2105),
  ('test-flat-cleaning', 'test-flat-cara', 1, 590),
  ('test-flat-cleaning', 'test-flat-bob', 1, 590),
  ('test-flat-cleaning', 'test-flat-dana', 1, 590),
  ('test-flat-cleaning', 'test-flat-alex', 1, 590),
  ('test-ski-chalet', 'test-ski-bob', 1, 40000),
  ('test-ski-chalet', 'test-ski-alex', 1, 40000),
  ('test-ski-payment', 'test-ski-bob', 1, 40000);

-- Cara has sent Alex money that Alex still has to confirm; the ski trip was settled the same way.
INSERT OR IGNORE INTO payments (id, group_id, from_member, to_member, amount_cents, status, expense_id, created_by, created_at, updated_at, confirmed_by, confirmed_at) VALUES
  ('test-ghent-cara-alex', 'test-ghent', 'test-ghent-cara', 'test-ghent-alex', 5000, 'sent', NULL, 'test-cara', 1790400000000, 1790400000000, NULL, NULL),
  ('test-ski-alex-bob', 'test-ski', 'test-ski-alex', 'test-ski-bob', 40000, 'received', 'test-ski-payment', 'test-alex', 1740000000000, 1740000000000, 'test-bob', 1740000000000);

-- Each group's share link (multi_use, never expires).
INSERT OR IGNORE INTO invites (id, group_id, token, member_id, label, created_by, created_at, expires_at, multi_use) VALUES
  ('test-ghent-link', 'test-ghent', 'test-ghent-share-link', NULL, '', 'test-alex', 1790100000000, 253402300799000, 1),
  ('test-flat-link', 'test-flat', 'test-flat-share-link', NULL, '', 'test-cara', 1790100000000, 253402300799000, 1),
  ('test-ski-link', 'test-ski', 'test-ski-share-link', NULL, '', 'test-bob', 1738000000000, 253402300799000, 1);
