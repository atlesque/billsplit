-- Payment reminders: when the group owner turns them on (reminders_at is when), anyone with an
-- account who has owed money in the group for over a week, without paying or marking a payment as
-- sent, gets a reminder email, at most once a week. reminded_at is when a member was last reminded.
ALTER TABLE groups ADD COLUMN reminders_at INTEGER;
ALTER TABLE members ADD COLUMN reminded_at INTEGER;
