ALTER TABLE chat_messages ADD COLUMN recipient_id TEXT REFERENCES users(id) ON DELETE CASCADE;

CREATE INDEX chat_messages_private_idx ON chat_messages (group_id, user_id, recipient_id, timestamp_ms DESC);
