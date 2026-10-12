ALTER TABLE users ADD COLUMN last_login_at INTEGER;

-- Single-use invite links. An invite can be tied to one participant (member_id); label keeps
-- that participant's name for the history even if they are later renamed or removed.
CREATE TABLE invites (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups (id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  member_id TEXT REFERENCES members (id) ON DELETE SET NULL,
  label TEXT NOT NULL DEFAULT '',
  created_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  used_at INTEGER,
  revoked_at INTEGER
);
CREATE INDEX invites_group ON invites (group_id, created_at);
CREATE INDEX invites_member ON invites (member_id);

-- Every email the app tried to send, with the delivery result.
CREATE TABLE email_log (
  id TEXT PRIMARY KEY,
  to_email TEXT NOT NULL,
  kind TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL,
  error TEXT,
  message_id TEXT,
  login_request_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX email_log_created ON email_log (created_at);
CREATE INDEX email_log_request ON email_log (login_request_id);

-- Append-only record of user actions. No foreign keys, so entries outlive deleted rows.
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  actor_id TEXT,
  actor_email TEXT,
  action TEXT NOT NULL,
  group_id TEXT,
  target TEXT,
  details TEXT NOT NULL DEFAULT '{}',
  ip TEXT
);
CREATE INDEX audit_at ON audit_log (at);
CREATE INDEX audit_actor ON audit_log (actor_id, at);
CREATE INDEX audit_group ON audit_log (group_id, at);
CREATE INDEX audit_action ON audit_log (action, at);

-- Carry over the old per-group invite links as open (not participant-bound) invites.
INSERT INTO invites (id, group_id, token, label, created_by, created_at, expires_at)
SELECT lower(hex(randomblob(9))), id, invite_token, '', created_by, created_at, created_at + 30 * 86400000 FROM groups;
