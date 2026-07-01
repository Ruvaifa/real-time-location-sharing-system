-- Truncate existing data to clear out old rooms
TRUNCATE trips, locations, room_members, chat_messages CASCADE;

CREATE TABLE rooms (
  id TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  creator_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
