-- The language a person last used the app in ('en' or 'nl'), so emails sent on someone else's
-- action (payment notifications) reach them in their own language. Empty until they next sign in
-- or use the app; emails fall back to English then.
ALTER TABLE users ADD COLUMN lang TEXT NOT NULL DEFAULT '';
