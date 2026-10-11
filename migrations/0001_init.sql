CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

-- One pending sign-in per row. The code and the link token are stored as SHA-256 hashes.
CREATE TABLE login_requests (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  link_hash TEXT NOT NULL UNIQUE,
  next_path TEXT NOT NULL DEFAULT '/',
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX login_requests_email ON login_requests (email, created_at);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions (user_id);

CREATE TABLE groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'EUR',
  invite_token TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL REFERENCES users (id),
  created_at INTEGER NOT NULL
);

-- Participants in a group. user_id is set once a signed-in user claims the participant.
CREATE TABLE members (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  user_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX members_group ON members (group_id);
CREATE UNIQUE INDEX members_group_user ON members (group_id, user_id) WHERE user_id IS NOT NULL;
CREATE INDEX members_user ON members (user_id);

-- kind: 'expense' (paid for the group) or 'transfer' (money given from payer to the share holders).
CREATE TABLE expenses (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups (id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'expense',
  title TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  paid_by TEXT NOT NULL REFERENCES members (id),
  spent_on TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  split_mode TEXT NOT NULL DEFAULT 'equal',
  created_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX expenses_group ON expenses (group_id, spent_on);

-- weight is the user input (shares or cents depending on split_mode); amount_cents is the resolved share.
CREATE TABLE expense_shares (
  expense_id TEXT NOT NULL REFERENCES expenses (id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES members (id),
  weight INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL,
  PRIMARY KEY (expense_id, member_id)
);
CREATE INDEX expense_shares_member ON expense_shares (member_id);
