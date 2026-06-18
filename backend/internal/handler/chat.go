package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	appmw "location-sharing-backend/internal/middleware"
	"location-sharing-backend/internal/model"
	"location-sharing-backend/pkg/apierr"
)

const (
	defaultChatHistoryLimit = 50
	maxChatHistoryLimit     = 100
)

type chatHistoryResponse struct {
	Items []model.ChatMessage `json:"items"`
}

// GetGroupMessages handles GET /api/groups/{groupID}/messages.
func (h *Handler) GetGroupMessages(w http.ResponseWriter, r *http.Request) {
	userID, ok := appmw.GetUserID(r.Context())
	if !ok {
		apierr.Render(w, http.StatusUnauthorized, "UNAUTHORIZED", "User identity not found in context")
		return
	}

	groupID := chi.URLParam(r, "groupID")
	if groupID == "" {
		apierr.Render(w, http.StatusBadRequest, "MISSING_GROUP_ID", "groupID is required")
		return
	}
	if len(groupID) > 64 {
		apierr.Render(w, http.StatusBadRequest, "INVALID_GROUP_ID", "groupID too long")
		return
	}
	if h.hub.Store == nil {
		apierr.Render(w, http.StatusServiceUnavailable, "NOT_READY", "Message store unavailable")
		return
	}

	limit := defaultChatHistoryLimit
	if raw := r.URL.Query().Get("limit"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed <= 0 {
			apierr.Render(w, http.StatusBadRequest, "INVALID_LIMIT", "limit must be a positive integer")
			return
		}
		limit = parsed
	}
	if limit > maxChatHistoryLimit {
		limit = maxChatHistoryLimit
	}

	var before int64
	if raw := r.URL.Query().Get("before"); raw != "" {
		parsed, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || parsed <= 0 {
			apierr.Render(w, http.StatusBadRequest, "INVALID_BEFORE", "before must be a positive timestamp")
			return
		}
		before = parsed
	}

	isMember, err := h.hub.Store.IsRoomMember(r.Context(), groupID, userID)
	if err != nil {
		slog.Error("Failed to check room membership", "group", groupID, "user", userID, "error", err)
		apierr.Render(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Could not fetch messages")
		return
	}
	if !isMember {
		apierr.Render(w, http.StatusForbidden, "NOT_ROOM_MEMBER", "Join the room before reading messages")
		return
	}

	messages, err := h.hub.Store.ListChatMessages(r.Context(), groupID, limit, before)
	if err != nil {
		slog.Error("Failed to list chat messages", "group", groupID, "user", userID, "error", err)
		apierr.Render(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Could not fetch messages")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(chatHistoryResponse{Items: messages})
}
