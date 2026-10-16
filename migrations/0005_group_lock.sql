-- A locked group keeps its share link but nobody new can join through it (or any other invite).
-- Replaces resetting the link: group links no longer change.
ALTER TABLE groups ADD COLUMN locked_at INTEGER;
