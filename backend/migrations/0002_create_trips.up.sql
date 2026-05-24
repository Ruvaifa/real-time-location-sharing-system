CREATE TABLE trips (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL,
    creator_id TEXT NOT NULL REFERENCES users(id),
    creator_name TEXT NOT NULL,
    origin_lat DOUBLE PRECISION NOT NULL,
    origin_lng DOUBLE PRECISION NOT NULL,
    origin_name TEXT NOT NULL DEFAULT '',
    dest_lat DOUBLE PRECISION NOT NULL,
    dest_lng DOUBLE PRECISION NOT NULL,
    dest_name TEXT NOT NULL DEFAULT '',
    route_geometry TEXT NOT NULL DEFAULT '',
    distance_meters DOUBLE PRECISION NOT NULL DEFAULT 0,
    duration_seconds DOUBLE PRECISION NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'planning',
    participants JSONB NOT NULL DEFAULT '[]',
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX trips_group_id_idx ON trips (group_id);
CREATE INDEX trips_status_idx ON trips (status);
