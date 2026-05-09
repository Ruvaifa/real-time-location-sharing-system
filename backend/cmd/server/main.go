package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"location-sharing-backend/internal/config"
	"location-sharing-backend/internal/handler"
	"location-sharing-backend/internal/storage"
	"location-sharing-backend/internal/websocket"
)

func main() {
	// 1. Load Configuration
	cfg := config.Load()

	// 1b. Initialize database
	store, err := storage.NewPostgresStore(cfg.DBConnString())
	if err != nil {
		log.Fatalf("Database connection failed: %v", err)
	}
	defer store.Close()

	// 2. Initialize the WebSocket Hub
	hub := websocket.NewHub(cfg.MaxGroupSize, cfg.MaxMsgRate, store)
	go hub.Run()

	// 2b. Start retention pruning
	prunerCtx, prunerCancel := context.WithCancel(context.Background())
	defer prunerCancel()
	go storage.StartLocationPruner(prunerCtx, store, cfg.LocationRetentionDays, 12*time.Hour)

	// 3. Initialize Handlers
	h := handler.NewHandler(hub, cfg)
	router := h.Routes()

	// 4. Configure HTTP Server
	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      router,
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

		log.Println("Shutting down server gracefully...")
		hub.Stop()
		prunerCancel()

		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		if err := srv.Shutdown(ctx); err != nil {
			log.Printf("HTTP server Shutdown error: %v", err)
		}
		close(idleConnsClosed)
	}()

	log.Printf("Server starting on port %s in %s mode", cfg.Port, cfg.Env)
	if err := srv.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("HTTP server ListenAndServe: %v", err)
	}

	<-idleConnsClosed
	log.Println("Server stopped")
}
