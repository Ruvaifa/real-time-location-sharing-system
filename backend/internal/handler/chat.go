package handler

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
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

// UploadImage handles POST /api/groups/{groupID}/chat/upload.
func (h *Handler) UploadImage(w http.ResponseWriter, r *http.Request) {
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

	// Verify group membership
	isMember, err := h.hub.Store.IsRoomMember(r.Context(), groupID, userID)
	if err != nil {
		slog.Error("Failed to check room membership for upload", "group", groupID, "user", userID, "error", err)
		apierr.Render(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Could not check membership")
		return
	}
	if !isMember {
		apierr.Render(w, http.StatusForbidden, "NOT_ROOM_MEMBER", "Join the room before uploading images")
		return
	}

	// Limit multipart form memory
	maxSize := int64(h.cfg.MaxUploadSize)
	if maxSize <= 0 {
		maxSize = 5242880 // default 5MB
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxSize)
	if err := r.ParseMultipartForm(maxSize); err != nil {
		apierr.Render(w, http.StatusBadRequest, "FILE_TOO_LARGE", "File size exceeds maximum limit")
		return
	}

	file, header, err := r.FormFile("image")
	if err != nil {
		apierr.Render(w, http.StatusBadRequest, "INVALID_FILE", "Could not retrieve the image from request")
		return
	}
	defer file.Close()

	if header.Size > maxSize {
		apierr.Render(w, http.StatusBadRequest, "FILE_TOO_LARGE", "File size exceeds maximum limit")
		return
	}

	// Detect content type by reading first 512 bytes
	buff := make([]byte, 512)
	n, err := file.Read(buff)
	if err != nil && err != io.EOF {
		apierr.Render(w, http.StatusBadRequest, "INVALID_FILE", "Could not read file content for validation")
		return
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		apierr.Render(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Could not process file")
		return
	}

	contentType := http.DetectContentType(buff[:n])
	var ext string
	switch contentType {
	case "image/jpeg":
		ext = ".jpg"
	case "image/png":
		ext = ".png"
	case "image/gif":
		ext = ".gif"
	case "image/webp":
		ext = ".webp"
	default:
		apierr.Render(w, http.StatusBadRequest, "INVALID_FILE_TYPE", "Only JPEG, PNG, GIF, and WEBP images are allowed")
		return
	}

	// Generate safe, unique filename
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		slog.Error("Failed to generate random file name", "error", err)
		apierr.Render(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Could not generate file name")
		return
	}
	fileName := hex.EncodeToString(b[:]) + ext

	// Setup directories
	uploadDir := h.cfg.UploadDir
	if uploadDir == "" {
		uploadDir = "./uploads"
	}
	groupDir := filepath.Join(uploadDir, groupID)
	if err := os.MkdirAll(groupDir, 0755); err != nil {
		slog.Error("Failed to create group upload directory", "dir", groupDir, "error", err)
		apierr.Render(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Could not create storage directory")
		return
	}

	dstPath := filepath.Join(groupDir, fileName)
	dst, err := os.OpenFile(dstPath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0644)
	if err != nil {
		slog.Error("Failed to create file on disk", "path", dstPath, "error", err)
		apierr.Render(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Could not save file")
		return
	}
	defer dst.Close()

	if _, err := io.Copy(dst, file); err != nil {
		slog.Error("Failed to copy file contents", "path", dstPath, "error", err)
		apierr.Render(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Could not write file content")
		return
	}

	mediaURL := "/uploads/" + groupID + "/" + fileName
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"url": mediaURL})
}
