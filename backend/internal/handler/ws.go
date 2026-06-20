package handler

import (
	"context"
	"log"
	"log/slog"
	"net/http"
	"os"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/gorilla/websocket"

	"location-sharing-backend/internal/auth"
	"location-sharing-backend/internal/config"
	appmw "location-sharing-backend/internal/middleware"
	"location-sharing-backend/internal/services/geocoding"
	"location-sharing-backend/internal/services/routing"
	ws "location-sharing-backend/internal/websocket"
	"location-sharing-backend/pkg/apierr"
)

// Handler holds dependencies for HTTP handlers.
type Handler struct {
	hub            *ws.Hub
	cfg            *config.Config
	tm             *auth.TokenManager
	upgrader       websocket.Upgrader
	routeH         *routing.Handler
	geoH           *geocoding.Handler
	generalLimiter *appmw.IPRateLimiter
	loginLimiter   *appmw.IPRateLimiter
}

// NewHandler creates a Handler with a configured WebSocket upgrader.
func NewHandler(hub *ws.Hub, cfg *config.Config, router routing.Router, geocoder geocoding.Geocoder) *Handler {
	allowed := make(map[string]bool, len(cfg.AllowedOrigins))
	for _, o := range cfg.AllowedOrigins {
		allowed[o] = true
	}

	return &Handler{
		hub:    hub,
		cfg:    cfg,
		tm:     auth.NewTokenManager(cfg.JWTSecret),
		routeH: routing.NewHandler(router),
		geoH:   geocoding.NewHandler(geocoder),
		upgrader: websocket.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
			CheckOrigin: func(r *http.Request) bool {
				return allowed[r.Header.Get("Origin")]
			},
		},
	}
}

// Routes returns a chi.Router with all endpoints.
func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()

	// Global limiters
	h.generalLimiter = appmw.NewIPRateLimiter(10, 20)
	h.loginLimiter = appmw.NewIPRateLimiter(1, 5)

	r.Use(chimw.RequestID)
	r.Use(chimw.RealIP)
	r.Use(appmw.LoggerWithFormatter(&appmw.SanitizedLogFormatter{
		Inner:  &chimw.DefaultLogFormatter{Logger: log.Default()},
		Redact: []string{"token"},
	}))
	r.Use(chimw.Recoverer)
	r.Use(appmw.CORS(h.cfg.AllowedOrigins))
	r.Use(appmw.RateLimit(h.generalLimiter))

	// Serve uploaded static files
	uploadDir := h.cfg.UploadDir
	if uploadDir == "" {
		uploadDir = "./uploads"
	}
	if _, err := os.Stat(uploadDir); os.IsNotExist(err) {
		if err := os.MkdirAll(uploadDir, 0755); err != nil {
			slog.Error("Failed to create upload directory", "path", uploadDir, "error", err)
		}
	}
	fileServer := http.FileServer(http.Dir(uploadDir))
	r.Handle("/uploads/*", http.StripPrefix("/uploads/", fileServer))

	// Public routes
	r.With(appmw.RateLimit(h.loginLimiter)).Post("/login", h.Login)
	r.Get("/health", h.Health)
	r.Get("/ready", h.Ready)

	// Protected API routes
	r.Group(func(r chi.Router) {
		r.Use(appmw.Auth(h.tm))
		r.Get("/api/search", h.geoH.Search)
		r.Get("/api/route", h.routeH.GetRoute)
		r.Get("/api/trip/{groupID}", h.GetActiveTrip)
		r.Get("/api/groups/{groupID}/messages", h.GetGroupMessages)
		r.Post("/api/groups/{groupID}/chat/upload", h.UploadImage)
		r.Get("/ws/{groupID}", h.ServeWs)
	})

	return r
}

// Close releases resources held by the handler (rate limiter sweep goroutines).
func (h *Handler) Close() {
	if h.generalLimiter != nil {
		h.generalLimiter.Stop()
	}
	if h.loginLimiter != nil {
		h.loginLimiter.Stop()
	}
}

// Health is a simple liveness probe.
func (h *Handler) Health(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("OK"))
}

// Ready checks that downstream dependencies (DB) are reachable.
func (h *Handler) Ready(w http.ResponseWriter, r *http.Request) {
	if err := h.hub.Store.Ping(r.Context()); err != nil {
		slog.Error("Readiness check failed", "error", err)
		apierr.Render(w, http.StatusServiceUnavailable, "NOT_READY", "Database unreachable")
		return
	}
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("OK"))
}

// Login creates a JWT for a user. In a real app, you'd check passwords here.
func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	userID := r.URL.Query().Get("username")
	if userID == "" {
		apierr.Render(w, http.StatusBadRequest, "MISSING_USERNAME", "username query parameter is required")
		return
	}

	token, err := h.tm.Generate(userID)
	if err != nil {
		slog.Error("Failed to generate token", "user", userID, "error", err)
		apierr.Render(w, http.StatusInternalServerError, "AUTH_ERROR", "Could not generate token")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"token":"` + token + `"}`))
}

// ServeWs upgrades an HTTP request to a WebSocket and registers the client.
func (h *Handler) ServeWs(w http.ResponseWriter, r *http.Request) {
	// 1. Get identity from middleware context (verified JWT)
	userID, ok := appmw.GetUserID(r.Context())
	if !ok {
		apierr.Render(w, http.StatusUnauthorized, "UNAUTHORIZED", "User identity not found in context")
		return
	}

	// 2. Validate group ID
	groupID := chi.URLParam(r, "groupID")
	if groupID == "" {
		apierr.Render(w, http.StatusBadRequest, "MISSING_GROUP_ID", "groupID path parameter is required")
		return
	}
	if len(groupID) > 64 {
		apierr.Render(w, http.StatusBadRequest, "INVALID_GROUP_ID", "groupID too long")
		return
	}

	if h.hub.Store != nil {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		if err := h.hub.Store.UpsertRoomMember(ctx, groupID, userID, userID); err != nil {
			slog.Error("Failed to join room", "user", userID, "group", groupID, "error", err)
			apierr.Render(w, http.StatusInternalServerError, "JOIN_ROOM_FAILED", "Could not join room")
			return
		}
	}

	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		slog.Error("WebSocket upgrade failed", "error", err)
		return
	}
	slog.Info("WebSocket connection upgraded", "user", userID, "group", groupID)

	client := &ws.Client{
		Hub:     h.hub,
		Conn:    conn,
		Send:    make(chan []byte, 256),
		GroupID: groupID,
		UserID:  userID,
	}

	h.hub.Register <- client

	go client.WritePump()
	go client.ReadPump()
}
