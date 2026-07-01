ALTER TABLE users ADD COLUMN email TEXT UNIQUE;
ALTER TABLE users ADD COLUMN password_hash TEXT;
CREATE INDEX users_email_idx ON users (email);
