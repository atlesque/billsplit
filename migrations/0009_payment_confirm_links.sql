-- The "payment sent" email links to a page where the recipient confirms that one payment. The link
-- carries a random token; only its SHA-256 hash is kept here, with when the link stops working.
-- The page also checks that the signed-in account is the payment's recipient.
ALTER TABLE payments ADD COLUMN confirm_token_hash TEXT;
ALTER TABLE payments ADD COLUMN confirm_expires_at INTEGER;
CREATE UNIQUE INDEX payments_confirm_token ON payments (confirm_token_hash) WHERE confirm_token_hash IS NOT NULL;
