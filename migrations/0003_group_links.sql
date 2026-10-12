-- One reusable share link per group. multi_use links are never "used up"; use_count and
-- last_used_at record how many people joined through them. Single-use links keep working.
ALTER TABLE invites ADD COLUMN multi_use INTEGER NOT NULL DEFAULT 0;
ALTER TABLE invites ADD COLUMN use_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE invites ADD COLUMN last_used_at INTEGER;

-- Give every existing group a share link (expires_at far in the future: only a reset ends it).
INSERT INTO invites (id, group_id, token, member_id, label, created_by, created_at, expires_at, multi_use)
SELECT lower(hex(randomblob(9))), g.id, lower(hex(randomblob(18))), NULL, '', g.created_by,
       CAST(strftime('%s', 'now') AS INTEGER) * 1000, 253402300799000, 1
FROM groups g;
