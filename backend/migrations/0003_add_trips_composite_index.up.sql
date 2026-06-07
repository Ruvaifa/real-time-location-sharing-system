CREATE INDEX trips_group_status_created_idx ON trips (group_id, status, created_at DESC);
