-- Bank details a person wants to be paid back on (per account, shown to people in their groups).
-- IBAN and BIC are stored without spaces; an empty IBAN means no bank details.
ALTER TABLE users ADD COLUMN bank_name TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN bank_iban TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN bank_bic TEXT NOT NULL DEFAULT '';

-- Settle-up payments, confirmed by both sides. The sender marks one as sent; the recipient marks it
-- received, not received (still in progress) or failed. Only once received does it count: a
-- 'transfer' expense is created then (expense_id), so balances, the list and the export include it.
CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups (id) ON DELETE CASCADE,
  from_member TEXT NOT NULL REFERENCES members (id),
  to_member TEXT NOT NULL REFERENCES members (id),
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  expense_id TEXT REFERENCES expenses (id) ON DELETE SET NULL,
  created_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  confirmed_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  confirmed_at INTEGER
);
CREATE INDEX payments_group ON payments (group_id, status);
CREATE INDEX payments_to ON payments (to_member, status);
CREATE INDEX payments_from ON payments (from_member);
CREATE INDEX payments_expense ON payments (expense_id);
