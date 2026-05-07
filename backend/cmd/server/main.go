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
	"location-sharing-backend/internal/websocket"
)

func main() {
	// 1. Load Configuration from environment variables
	cfg := config.Load()

	// 2. Initialize the WebSocket Hub (manages concurrency and broadcasts)
	hub := websocket.NewHub(cfg.MaxGroupSize, cfg.MaxMsgRate)
	go hub.Run()

	// 3. Initialize Request Handlers (WebSocket + Health)
	h := handler.NewHandler(hub, cfg)
	router := h.Routes()

	// 4. Configure HTTP Server
	srv := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: router,
		// Good practice to set timeouts to prevent resource exhaustion
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// 5. Graceful Shutdown Logic
	// This ensures we clean up channels and close connections before exiting.
	idleConnsClosed := make(chan struct{})
	go func() {
		sigint := make(chan os.Signal, 1)
		signal.Notify(sigint, os.Interrupt, syscall.SIGTERM)
		<-sigint

		log.Println("Shutting down server gracefully...")
		hub.Stop() // Signal the Hub to close all client connections

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
