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
