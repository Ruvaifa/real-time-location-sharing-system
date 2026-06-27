package storage

import (
	"context"
	"time"

	"location-sharing-backend/internal/model"
)

// Store defines database operations used by the app.
type Store interface {
	UpsertUser(ctx context.Context, userID, name string) error
	InsertLocation(ctx context.Context, loc model.LocationMessage) error
	PruneLocations(ctx context.Context, retentionDays int) (int64, error)

	CreateTrip(ctx context.Context, trip *model.Trip) error
	GetActiveTripByGroup(ctx context.Context, groupID string) (*model.Trip, error)
	UpdateTripStatus(ctx context.Context, tripID, status string) error
	UpdateTripParticipants(ctx context.Context, tripID string, participants []string) error

	UpsertRoomMember(ctx context.Context, groupID, userID, username string) error
	IsRoomMember(ctx context.Context, groupID, userID string) (bool, error)
	CreateChatMessage(ctx context.Context, msg *model.ChatMessage) error
	ListChatMessages(ctx context.Context, groupID string, limit int, before int64) ([]model.ChatMessage, error)
	ListPrivateChatMessages(ctx context.Context, groupID, userA, userB string, limit int, before int64) ([]model.ChatMessage, error)

	Ping(ctx context.Context) error
	Close() error
}

// StartLocationPruner periodically removes old location records.
func StartLocationPruner(ctx context.Context, store Store, retentionDays int, interval time.Duration) {
	if store == nil || retentionDays <= 0 {
		return
	}

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			pruneCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
			_, _ = store.PruneLocations(pruneCtx, retentionDays)
			cancel()
		}
	}
}
