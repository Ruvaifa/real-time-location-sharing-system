DROP INDEX IF EXISTS users_reset_token_idx;
ALTER TABLE users DROP COLUMN IF EXISTS reset_token;
ALTER TABLE users DROP COLUMN IF EXISTS reset_token_expires_at;
