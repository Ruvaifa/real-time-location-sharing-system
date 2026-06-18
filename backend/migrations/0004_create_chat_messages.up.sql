CREATE TABLE room_members (
    group_id TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    username TEXT NOT NULL,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (group_id, user_id)
);

CREATE INDEX room_members_user_id_idx ON room_members (user_id);

CREATE TABLE chat_messages (
    id TEXT PRIMARY KEY,
    client_message_id TEXT,
    group_id TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    username TEXT NOT NULL,
    text TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'text',
    timestamp_ms BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX chat_messages_group_timestamp_idx ON chat_messages (group_id, timestamp_ms DESC);
CREATE INDEX chat_messages_group_id_idx ON chat_messages (group_id, id);
