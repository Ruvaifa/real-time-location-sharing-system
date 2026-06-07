package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"location-sharing-backend/internal/config"
	"location-sharing-backend/internal/handler"
	"location-sharing-backend/internal/services/cache"
	"location-sharing-backend/internal/services/geocoding"
	"location-sharing-backend/internal/services/routing"
	"location-sharing-backend/internal/storage"
	"location-sharing-backend/internal/websocket"
)

func main() {
	// 1. Load Configuration
	cfg := config.Load()

	// Set up structured logging.
	var logLevel slog.Level
	if cfg.Env == "production" {
		logLevel = slog.LevelInfo
	} else {
		logLevel = slog.LevelDebug
	}
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: logLevel})))

	// 1b. Initialize database
	store, err := storage.NewPostgresStore(cfg.DBConnString())
	if err != nil {
		slog.Error("Database connection failed", "error", err)
		os.Exit(1)
	}
	defer store.Close()

	// 1c. Initialize external services with caching
	routingCache := cache.New[*routing.RouteResult](
		time.Duration(cfg.RoutingCacheTTL)*time.Minute, 1000,
	)
	router := routing.NewOSRMRouter(cfg.OSRMBaseURL, routingCache)

	geocodingCache := cache.New[[]geocoding.SearchResult](
		time.Duration(cfg.GeocodingCacheTTL)*time.Minute, 500,
	)
	geocoder := geocoding.NewNominatimGeocoder(cfg.NominatimBaseURL, geocodingCache)

	// 2. Initialize the WebSocket Hub
	hub := websocket.NewHub(cfg.MaxGroupSize, cfg.MaxMsgRate, store)
	go hub.Run()

	// 2b. Start retention pruning
	prunerCtx, prunerCancel := context.WithCancel(context.Background())
	defer prunerCancel()
	go storage.StartLocationPruner(prunerCtx, store, cfg.LocationRetentionDays, 12*time.Hour)

	// 3. Initialize Handlers
	h := handler.NewHandler(hub, cfg, router, geocoder)
	routerChi := h.Routes()

	// 4. Configure HTTP Server
	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      routerChi,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// 5. Graceful Shutdown
	idleConnsClosed := make(chan struct{})
	go func() {
		sigint := make(chan os.Signal, 1)
		signal.Notify(sigint, os.Interrupt, syscall.SIGTERM)
		<-sigint

		slog.Info("Shutting down server gracefully...")
		hub.Stop()
		prunerCancel()
		h.Close()

		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		if err := srv.Shutdown(ctx); err != nil {
			slog.Error("HTTP server shutdown error", "error", err)
		}
		close(idleConnsClosed)
	}()

	slog.Info("Server starting", "port", cfg.Port, "env", cfg.Env)
	if err := srv.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
		slog.Error("HTTP server ListenAndServe failed", "error", err)
		os.Exit(1)
	}

	<-idleConnsClosed
	slog.Info("Server stopped")
}
