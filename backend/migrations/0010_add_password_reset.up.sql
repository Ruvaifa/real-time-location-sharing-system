ALTER TABLE users ADD COLUMN reset_token TEXT;
ALTER TABLE users ADD COLUMN reset_token_expires_at TIMESTAMP WITH TIME ZONE;
CREATE INDEX users_reset_token_idx ON users (reset_token);
