package handler

import (
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/gorilla/websocket"

	"location-sharing-backend/internal/auth"
	"location-sharing-backend/internal/config"
	appmw "location-sharing-backend/internal/middleware"
	ws "location-sharing-backend/internal/websocket"
	"location-sharing-backend/pkg/apierr"
)

// Handler holds dependencies for HTTP handlers.
type Handler struct {
	hub      *ws.Hub
	cfg      *config.Config
	tm       *auth.TokenManager
	upgrader websocket.Upgrader
}

// NewHandler creates a Handler with a configured WebSocket upgrader.
func NewHandler(hub *ws.Hub, cfg *config.Config) *Handler {
	allowed := make(map[string]bool, len(cfg.AllowedOrigins))
	for _, o := range cfg.AllowedOrigins {
		allowed[o] = true
	}

	return &Handler{
		hub: hub,
		cfg: cfg,
		tm:  auth.NewTokenManager(cfg.JWTSecret),
		upgrader: websocket.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
			CheckOrigin: func(r *http.Request) bool {
				return allowed[r.Header.Get("Origin")]
			},
		},
	}
}

// Routes returns a chi.Router with all WebSocket and utility endpoints.
func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()

	// Global limiters
	generalLimiter := appmw.NewIPRateLimiter(10, 20) // 10 req/s, 20 burst
	loginLimiter := appmw.NewIPRateLimiter(1, 5)    // 1 login/s, 5 burst

	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)
	r.Use(appmw.CORS(h.cfg.AllowedOrigins))
	r.Use(appmw.RateLimit(generalLimiter))

	// Public routes
	r.With(appmw.RateLimit(loginLimiter)).Post("/login", h.Login)
	r.Get("/health", h.Health)

	// Protected WebSocket route
	r.Group(func(r chi.Router) {
		r.Use(appmw.Auth(h.tm))
		r.Get("/ws/{groupID}", h.ServeWs)
	})

	return r
}

// Health is a simple liveness probe.
func (h *Handler) Health(w http.ResponseWriter, r *http.Request) {
	log.Printf("Health check requested from %s", r.RemoteAddr)
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("OK"))
}

// Login creates a JWT for a user. In a real app, you'd check passwords here.
func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	userID := r.URL.Query().Get("username")
	log.Printf("Login attempt for username: %s", userID)
	if userID == "" {
		apierr.Render(w, http.StatusBadRequest, "MISSING_USERNAME", "username query parameter is required")
		return
	}

	token, err := h.tm.Generate(userID)
	if err != nil {
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

	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("ws upgrade error: %v", err)
		return
	}
	log.Printf("WebSocket connection upgraded for user %s in group %s", userID, groupID)

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
