package handler

import (
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/gorilla/websocket"

	"location-sharing-backend/internal/config"
	ws "location-sharing-backend/internal/websocket"
	"location-sharing-backend/pkg/apierr"
)

// Handler holds dependencies for HTTP handlers.
type Handler struct {
	hub      *ws.Hub
	cfg      *config.Config
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
	r.Get("/ws/{groupID}", h.ServeWs)
	r.Get("/health", h.Health)
	return r
}

// Health is a simple liveness probe.
func (h *Handler) Health(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("OK"))
}

// ServeWs upgrades an HTTP request to a WebSocket and registers the client.
func (h *Handler) ServeWs(w http.ResponseWriter, r *http.Request) {
	groupID := chi.URLParam(r, "groupID")
	if groupID == "" {
		apierr.Render(w, http.StatusBadRequest, "MISSING_GROUP_ID", "groupID path parameter is required")
		return
	}

	userID := r.URL.Query().Get("userID")
	if userID == "" {
		apierr.Render(w, http.StatusBadRequest, "MISSING_USER_ID", "userID query parameter is required")
		return
	}
	if len(userID) > 64 {
		apierr.Render(w, http.StatusBadRequest, "INVALID_USER_ID", "userID too long")
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
