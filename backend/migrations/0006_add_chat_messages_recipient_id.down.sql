DROP INDEX IF EXISTS chat_messages_private_idx;
ALTER TABLE chat_messages DROP COLUMN IF EXISTS recipient_id;
