-- Receipts and invoices attached to an expense. The file itself lives in the FILES R2 bucket under
-- `key`; content_type is what the file's first bytes say it is, not what the browser claimed.
CREATE TABLE attachments (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups (id) ON DELETE CASCADE,
  expense_id TEXT NOT NULL REFERENCES expenses (id) ON DELETE CASCADE,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX attachments_expense ON attachments (expense_id, created_at);
CREATE INDEX attachments_group ON attachments (group_id);

-- An archived group is read-only. Its attachments are removed once it has been quiet for 90 days;
-- attachments_removed_at records when that happened, so the group can say so.
ALTER TABLE groups ADD COLUMN archived_at INTEGER;
ALTER TABLE groups ADD COLUMN archived_by TEXT REFERENCES users (id) ON DELETE SET NULL;
ALTER TABLE groups ADD COLUMN attachments_removed_at INTEGER;
