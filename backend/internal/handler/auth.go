package handler

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"

	appmw "location-sharing-backend/internal/middleware"
	"location-sharing-backend/pkg/apierr"
	"golang.org/x/crypto/bcrypt"
)

type signupRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	Name     string `json:"name"`
}

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type authResponse struct {
	Token string `json:"token"`
	User  struct {
		ID    string `json:"id"`
		Email string `json:"email"`
		Name  string `json:"name"`
	} `json:"user"`
}

// Signup registers a new user with an email and password.
func (h *Handler) Signup(w http.ResponseWriter, r *http.Request) {
	var req signupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		apierr.Render(w, http.StatusBadRequest, "BAD_REQUEST", "Invalid request body")
		return
	}

	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	req.Name = strings.TrimSpace(req.Name)
	if req.Email == "" || req.Password == "" || req.Name == "" {
		apierr.Render(w, http.StatusBadRequest, "INVALID_INPUT", "All fields are required")
		return
	}

	// Validate basic email structure (simple check - ponytail: keep it simple)
	if !strings.Contains(req.Email, "@") || !strings.Contains(req.Email, ".") {
		apierr.Render(w, http.StatusBadRequest, "INVALID_EMAIL", "Invalid email format")
		return
	}

	if len(req.Password) < 6 {
		apierr.Render(w, http.StatusBadRequest, "INVALID_PASSWORD", "Password must be at least 6 characters")
		return
	}

	// Hash password using bcrypt
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		slog.Error("Failed to hash password", "error", err)
		apierr.Render(w, http.StatusInternalServerError, "SERVER_ERROR", "Internal server error")
		return
	}

	// Generate secure random userID (16 bytes hex) - ponytail: zero dependency UUID alternative
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	userID := hex.EncodeToString(b)

	err = h.hub.Store.CreateUser(r.Context(), userID, req.Name, req.Email, string(hash))
	if err != nil {
		// Detect unique constraint violation on email
		errMsg := err.Error()
		if strings.Contains(errMsg, "duplicate key") || strings.Contains(errMsg, "unique constraint") {
			apierr.Render(w, http.StatusConflict, "EMAIL_EXISTS", "Email address already registered")
			return
		}
		slog.Error("Failed to create user", "error", err)
		apierr.Render(w, http.StatusInternalServerError, "SERVER_ERROR", "Internal server error")
		return
	}

	token, err := h.tm.Generate(userID)
	if err != nil {
		slog.Error("Failed to generate token", "user", userID, "error", err)
		apierr.Render(w, http.StatusInternalServerError, "AUTH_ERROR", "Could not generate token")
		return
	}

	resp := authResponse{Token: token}
	resp.User.ID = userID
	resp.User.Email = req.Email
	resp.User.Name = req.Name

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}

// Login authenticates a user with their email and password.
func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		apierr.Render(w, http.StatusBadRequest, "BAD_REQUEST", "Invalid request body")
		return
	}

	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	if req.Email == "" || req.Password == "" {
		apierr.Render(w, http.StatusBadRequest, "INVALID_INPUT", "Email and password are required")
		return
	}

	userID, name, hash, err := h.hub.Store.GetUserByEmail(r.Context(), req.Email)
	if err != nil {
		apierr.Render(w, http.StatusUnauthorized, "INVALID_CREDENTIALS", "Incorrect email or password")
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.Password)); err != nil {
		apierr.Render(w, http.StatusUnauthorized, "INVALID_CREDENTIALS", "Incorrect email or password")
		return
	}

	token, err := h.tm.Generate(userID)
	if err != nil {
		slog.Error("Failed to generate token", "user", userID, "error", err)
		apierr.Render(w, http.StatusInternalServerError, "AUTH_ERROR", "Could not generate token")
		return
	}

	resp := authResponse{Token: token}
	resp.User.ID = userID
	resp.User.Email = req.Email
	resp.User.Name = name

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}

type roomRequest struct {
	ID       string `json:"id"`
	Password string `json:"password"`
}

// CreateRoom handles room creation with a password.
func (h *Handler) CreateRoom(w http.ResponseWriter, r *http.Request) {
	userID, ok := appmw.GetUserID(r.Context())
	if !ok || userID == "" {
		apierr.Render(w, http.StatusUnauthorized, "UNAUTHORIZED", "User must be authenticated")
		return
	}

	var req roomRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		apierr.Render(w, http.StatusBadRequest, "BAD_REQUEST", "Invalid request body")
		return
	}

	req.ID = strings.TrimSpace(req.ID)
	req.Password = strings.TrimSpace(req.Password)
	if req.ID == "" || req.Password == "" {
		apierr.Render(w, http.StatusBadRequest, "INVALID_INPUT", "Room ID and Password are required")
		return
	}

	// Hash room password
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		apierr.Render(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Could not hash room password")
		return
	}

	// Insert into rooms
	if err := h.hub.Store.CreateRoom(r.Context(), req.ID, string(hash), userID); err != nil {
		apierr.Render(w, http.StatusConflict, "ROOM_EXISTS", "A room with this ID already exists")
		return
	}

	// Retrieve user name to register membership
	name, _, err := h.hub.Store.GetUser(r.Context(), userID)
	if err != nil {
		name = userID
	}

	// Register creator as a member of the room
	if err := h.hub.Store.UpsertRoomMember(r.Context(), req.ID, userID, name); err != nil {
		slog.Error("Failed to auto-join creator to room", "room", req.ID, "user", userID, "error", err)
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"id": req.ID})
}

// JoinRoom handles room join validation.
func (h *Handler) JoinRoom(w http.ResponseWriter, r *http.Request) {
	userID, ok := appmw.GetUserID(r.Context())
	if !ok || userID == "" {
		apierr.Render(w, http.StatusUnauthorized, "UNAUTHORIZED", "User must be authenticated")
		return
	}

	var req roomRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		apierr.Render(w, http.StatusBadRequest, "BAD_REQUEST", "Invalid request body")
		return
	}

	req.ID = strings.TrimSpace(req.ID)
	req.Password = strings.TrimSpace(req.Password)
	if req.ID == "" || req.Password == "" {
		apierr.Render(w, http.StatusBadRequest, "INVALID_INPUT", "Room ID and Password are required")
		return
	}

	hash, err := h.hub.Store.GetRoomPasswordHash(r.Context(), req.ID)
	if err != nil {
		apierr.Render(w, http.StatusNotFound, "ROOM_NOT_FOUND", "Room not found")
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.Password)); err != nil {
		apierr.Render(w, http.StatusUnauthorized, "INVALID_ROOM_PASSWORD", "Incorrect room password")
		return
	}

	name, _, err := h.hub.Store.GetUser(r.Context(), userID)
	if err != nil {
		name = userID
	}

	// Add user to room_members
	if err := h.hub.Store.UpsertRoomMember(r.Context(), req.ID, userID, name); err != nil {
		slog.Error("Failed to add user to room_members", "room", req.ID, "user", userID, "error", err)
		apierr.Render(w, http.StatusInternalServerError, "JOIN_ROOM_FAILED", "Could not join room")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}
