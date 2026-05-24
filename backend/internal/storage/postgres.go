package storage

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"

	"location-sharing-backend/internal/model"
)

// PostgresStore implements Store using PostgreSQL.
type PostgresStore struct {
	db *sql.DB
}

// NewPostgresStore creates a new PostgresStore and verifies connectivity.
func NewPostgresStore(dsn string) (*PostgresStore, error) {
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		return nil, err
	}

	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(30 * time.Minute)

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	if err := waitForPing(ctx, db); err != nil {
		_ = db.Close()
		return nil, err
	}

	return &PostgresStore{db: db}, nil
}

func waitForPing(ctx context.Context, db *sql.DB) error {
	retryDelay := 500 * time.Millisecond
	for {
		if err := db.PingContext(ctx); err == nil {
			return nil
		}
		if errors.Is(ctx.Err(), context.DeadlineExceeded) || errors.Is(ctx.Err(), context.Canceled) {
			return ctx.Err()
		}
		time.Sleep(retryDelay)
		if retryDelay < 3*time.Second {
			retryDelay += 500 * time.Millisecond
		}
	}
}

// UpsertUser inserts or updates a user record.
func (s *PostgresStore) UpsertUser(ctx context.Context, userID, name string) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO users (id, name)
		VALUES ($1, $2)
		ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
	`, userID, name)
	return err
}

// InsertLocation stores a new location record.
func (s *PostgresStore) InsertLocation(ctx context.Context, loc model.LocationMessage) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO locations (user_id, group_id, name, lat, lng, timestamp_ms)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, loc.UserID, loc.GroupID, loc.Name, loc.Lat, loc.Lng, loc.Timestamp)
	return err
}

// PruneLocations removes location records older than retentionDays.
func (s *PostgresStore) PruneLocations(ctx context.Context, retentionDays int) (int64, error) {
	result, err := s.db.ExecContext(ctx, `
		DELETE FROM locations
		WHERE created_at < NOW() - ($1 * INTERVAL '1 day')
	`, retentionDays)
	if err != nil {
		return 0, err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return 0, err
	}
	return rows, nil
}

// Close releases the underlying database connection.
func (s *PostgresStore) Close() error {
	return s.db.Close()
}

// CreateTrip inserts a new trip record.
func (s *PostgresStore) CreateTrip(ctx context.Context, trip *model.Trip) error {
	participantsJSON, err := json.Marshal(trip.Participants)
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO trips (id, group_id, creator_id, creator_name,
			origin_lat, origin_lng, origin_name,
			dest_lat, dest_lng, dest_name,
			route_geometry, distance_meters, duration_seconds,
			status, participants)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
	`, trip.ID, trip.GroupID, trip.CreatorID, trip.CreatorName,
		trip.OriginLat, trip.OriginLng, trip.OriginName,
		trip.DestLat, trip.DestLng, trip.DestName,
		trip.RouteGeometry, trip.DistanceMeters, trip.DurationSeconds,
		trip.Status, participantsJSON)
	return err
}

// GetActiveTripByGroup retrieves the most recent planning or active trip for a group.
func (s *PostgresStore) GetActiveTripByGroup(ctx context.Context, groupID string) (*model.Trip, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT id, group_id, creator_id, creator_name,
			origin_lat, origin_lng, origin_name,
			dest_lat, dest_lng, dest_name,
			route_geometry, distance_meters, duration_seconds,
			status, participants, started_at, ended_at, created_at
		FROM trips
		WHERE group_id = $1 AND status IN ('planning', 'active')
		ORDER BY created_at DESC
		LIMIT 1
	`, groupID)

	trip := &model.Trip{}
	var participantsJSON []byte
	var startedAt, endedAt sql.NullTime
	var createdAt time.Time

	err := row.Scan(
		&trip.ID, &trip.GroupID, &trip.CreatorID, &trip.CreatorName,
		&trip.OriginLat, &trip.OriginLng, &trip.OriginName,
		&trip.DestLat, &trip.DestLng, &trip.DestName,
		&trip.RouteGeometry, &trip.DistanceMeters, &trip.DurationSeconds,
		&trip.Status, &participantsJSON, &startedAt, &endedAt, &createdAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	if err := json.Unmarshal(participantsJSON, &trip.Participants); err != nil {
		return nil, err
	}
	if startedAt.Valid {
		ts := startedAt.Time.UnixMilli()
		trip.StartedAt = &ts
	}
	if endedAt.Valid {
		ts := endedAt.Time.UnixMilli()
		trip.EndedAt = &ts
	}
	trip.CreatedAt = createdAt.UnixMilli()

	return trip, nil
}

// UpdateTripStatus changes the status of a trip.
func (s *PostgresStore) UpdateTripStatus(ctx context.Context, tripID, status string) error {
	query := `UPDATE trips SET status = $1`
	args := []interface{}{status}

	if status == model.TripStatusActive {
		query += `, started_at = NOW()`
	} else if status == model.TripStatusCompleted {
		query += `, ended_at = NOW()`
	}

	query += ` WHERE id = $2`
	args = append(args, tripID)

	_, err := s.db.ExecContext(ctx, query, args...)
	return err
}

// UpdateTripParticipants replaces the participants list for a trip.
func (s *PostgresStore) UpdateTripParticipants(ctx context.Context, tripID string, participants []string) error {
	participantsJSON, err := json.Marshal(participants)
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx, `
		UPDATE trips SET participants = $1 WHERE id = $2
	`, participantsJSON, tripID)
	return err
}
