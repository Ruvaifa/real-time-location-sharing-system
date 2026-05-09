package storage

import (
	"context"
	"database/sql"
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
