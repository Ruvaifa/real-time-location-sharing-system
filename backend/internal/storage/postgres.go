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

// GetUser retrieves a user's name and email by their ID.
func (s *PostgresStore) GetUser(ctx context.Context, userID string) (string, string, error) {
	var name string
	var email sql.NullString
	err := s.db.QueryRowContext(ctx, `
		SELECT name, email
		FROM users
		WHERE id = $1
	`, userID).Scan(&name, &email)
	if err != nil {
		return "", "", err
	}
	return name, email.String, nil
}

// GetUserByEmail retrieves a user's details and password hash by their email.
func (s *PostgresStore) GetUserByEmail(ctx context.Context, email string) (string, string, string, error) {
	var id, name, hash string
	err := s.db.QueryRowContext(ctx, `
		SELECT id, name, password_hash
		FROM users
		WHERE email = $1
	`, email).Scan(&id, &name, &hash)
	return id, name, hash, err
}

// CreateUser inserts a new user record with email and password hash.
func (s *PostgresStore) CreateUser(ctx context.Context, userID, name, email, passwordHash string) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO users (id, name, email, password_hash)
		VALUES ($1, $2, $3, $4)
	`, userID, name, email, passwordHash)
	return err
}

// SaveResetToken saves a temporary password reset token for a user.
func (s *PostgresStore) SaveResetToken(ctx context.Context, email, token string, expiresAt time.Time) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE users 
		SET reset_token = $1, reset_token_expires_at = $2 
		WHERE email = $3
	`, token, expiresAt, email)
	return err
}

// GetUserByResetToken retrieves the user's email and reset token expiration time using the reset token.
func (s *PostgresStore) GetUserByResetToken(ctx context.Context, token string) (string, time.Time, error) {
	var email string
	var expiresAt time.Time
	err := s.db.QueryRowContext(ctx, `
		SELECT email, reset_token_expires_at 
		FROM users 
		WHERE reset_token = $1
	`, token).Scan(&email, &expiresAt)
	return email, expiresAt, err
}

// UpdateUserPasswordAndClearToken updates the password hash and invalidates the reset token.
func (s *PostgresStore) UpdateUserPasswordAndClearToken(ctx context.Context, email, passwordHash string) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE users 
		SET password_hash = $1, reset_token = NULL, reset_token_expires_at = NULL 
		WHERE email = $2
	`, passwordHash, email)
	return err
}

// CreateRoom inserts a new room record.
func (s *PostgresStore) CreateRoom(ctx context.Context, id, passwordHash, creatorID string) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO rooms (id, password_hash, creator_id)
		VALUES ($1, $2, $3)
	`, id, passwordHash, creatorID)
	return err
}

// GetRoomPasswordHash retrieves the password hash for a specific room ID.
func (s *PostgresStore) GetRoomPasswordHash(ctx context.Context, id string) (string, error) {
	var hash string
	err := s.db.QueryRowContext(ctx, `
		SELECT password_hash
		FROM rooms
		WHERE id = $1
	`, id).Scan(&hash)
	return hash, err
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

// Ping verifies the database connection is alive.
func (s *PostgresStore) Ping(ctx context.Context) error {
	return s.db.PingContext(ctx)
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

// UpsertRoomMember records that a user has joined a room and refreshes presence metadata.
func (s *PostgresStore) UpsertRoomMember(ctx context.Context, groupID, userID, username string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO users (id, name)
		VALUES ($1, $2)
		ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
	`, userID, username); err != nil {
		return err
	}

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO room_members (group_id, user_id, username)
		VALUES ($1, $2, $3)
		ON CONFLICT (group_id, user_id)
		DO UPDATE SET username = EXCLUDED.username, last_seen_at = NOW()
	`, groupID, userID, username); err != nil {
		return err
	}

	return tx.Commit()
}

// IsRoomMember reports whether a user has joined a room.
func (s *PostgresStore) IsRoomMember(ctx context.Context, groupID, userID string) (bool, error) {
	var exists bool
	err := s.db.QueryRowContext(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM room_members
			WHERE group_id = $1 AND user_id = $2
		)
	`, groupID, userID).Scan(&exists)
	return exists, err
}

// CreateChatMessage stores a durable room chat message.
func (s *PostgresStore) CreateChatMessage(ctx context.Context, msg *model.ChatMessage) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO chat_messages (
			id, client_message_id, group_id, user_id, username, text, media_url, kind, timestamp_ms, recipient_id
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
	`, msg.MessageID, nullString(msg.ClientMessageID), msg.GroupID, msg.UserID, msg.Username, msg.Text, nullString(msg.MediaURL), msg.Kind, msg.Timestamp, nullString(msg.RecipientID))
	return err
}

// ListChatMessages returns room messages oldest-to-newest, with optional timestamp pagination.
func (s *PostgresStore) ListChatMessages(ctx context.Context, groupID string, limit int, before int64) ([]model.ChatMessage, error) {
	if limit <= 0 {
		limit = 50
	}

	var (
		rows *sql.Rows
		err  error
	)
	if before > 0 {
		rows, err = s.db.QueryContext(ctx, `
			SELECT id, COALESCE(client_message_id, ''), group_id, user_id, username, text, COALESCE(media_url, ''), kind, timestamp_ms, COALESCE(recipient_id, '')
			FROM (
				SELECT id, client_message_id, group_id, user_id, username, text, media_url, kind, timestamp_ms, recipient_id
				FROM chat_messages
				WHERE group_id = $1 AND recipient_id IS NULL AND timestamp_ms < $2
				ORDER BY timestamp_ms DESC, created_at DESC
				LIMIT $3
			) recent
			ORDER BY timestamp_ms ASC
		`, groupID, before, limit)
	} else {
		rows, err = s.db.QueryContext(ctx, `
			SELECT id, COALESCE(client_message_id, ''), group_id, user_id, username, text, COALESCE(media_url, ''), kind, timestamp_ms, COALESCE(recipient_id, '')
			FROM (
				SELECT id, client_message_id, group_id, user_id, username, text, media_url, kind, timestamp_ms, recipient_id
				FROM chat_messages
				WHERE group_id = $1 AND recipient_id IS NULL
				ORDER BY timestamp_ms DESC, created_at DESC
				LIMIT $2
			) recent
			ORDER BY timestamp_ms ASC
		`, groupID, limit)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	messages := make([]model.ChatMessage, 0, limit)
	for rows.Next() {
		var msg model.ChatMessage
		if err := rows.Scan(
			&msg.MessageID,
			&msg.ClientMessageID,
			&msg.GroupID,
			&msg.UserID,
			&msg.Username,
			&msg.Text,
			&msg.MediaURL,
			&msg.Kind,
			&msg.Timestamp,
			&msg.RecipientID,
		); err != nil {
			return nil, err
		}
		messages = append(messages, msg)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return messages, nil
}

// ListPrivateChatMessages returns private chat messages between two users in a room oldest-to-newest.
func (s *PostgresStore) ListPrivateChatMessages(ctx context.Context, groupID, userA, userB string, limit int, before int64) ([]model.ChatMessage, error) {
	if limit <= 0 {
		limit = 50
	}

	var (
		rows *sql.Rows
		err  error
	)
	if before > 0 {
		rows, err = s.db.QueryContext(ctx, `
			SELECT id, COALESCE(client_message_id, ''), group_id, user_id, username, text, COALESCE(media_url, ''), kind, timestamp_ms, COALESCE(recipient_id, '')
			FROM (
				SELECT id, client_message_id, group_id, user_id, username, text, media_url, kind, timestamp_ms, recipient_id
				FROM chat_messages
				WHERE group_id = $1 
				  AND ((user_id = $2 AND recipient_id = $3) OR (user_id = $3 AND recipient_id = $2))
				  AND timestamp_ms < $4
				ORDER BY timestamp_ms DESC, created_at DESC
				LIMIT $5
			) recent
			ORDER BY timestamp_ms ASC
		`, groupID, userA, userB, before, limit)
	} else {
		rows, err = s.db.QueryContext(ctx, `
			SELECT id, COALESCE(client_message_id, ''), group_id, user_id, username, text, COALESCE(media_url, ''), kind, timestamp_ms, COALESCE(recipient_id, '')
			FROM (
				SELECT id, client_message_id, group_id, user_id, username, text, media_url, kind, timestamp_ms, recipient_id
				FROM chat_messages
				WHERE group_id = $1
				  AND ((user_id = $2 AND recipient_id = $3) OR (user_id = $3 AND recipient_id = $2))
				  ORDER BY timestamp_ms DESC, created_at DESC
				LIMIT $4
			) recent
			ORDER BY timestamp_ms ASC
		`, groupID, userA, userB, limit)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	messages := make([]model.ChatMessage, 0, limit)
	for rows.Next() {
		var msg model.ChatMessage
		if err := rows.Scan(
			&msg.MessageID,
			&msg.ClientMessageID,
			&msg.GroupID,
			&msg.UserID,
			&msg.Username,
			&msg.Text,
			&msg.MediaURL,
			&msg.Kind,
			&msg.Timestamp,
			&msg.RecipientID,
		); err != nil {
			return nil, err
		}
		messages = append(messages, msg)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return messages, nil
}

func nullString(value string) sql.NullString {
	if value == "" {
		return sql.NullString{}
	}
	return sql.NullString{String: value, Valid: true}
}
