package handler

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"golang.org/x/crypto/bcrypt"

	appmw "location-sharing-backend/internal/middleware"
	"location-sharing-backend/pkg/apierr"
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

type roomInviteRequest struct {
	Token string `json:"token"`
}

func randomHex(bytes int) (string, error) {
	b := make([]byte, bytes)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
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

type forgotPasswordRequest struct {
	Email string `json:"email"`
}

// ForgotPassword handles sending a password reset email via Google Gmail API.
func (h *Handler) ForgotPassword(w http.ResponseWriter, r *http.Request) {
	var req forgotPasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		apierr.Render(w, http.StatusBadRequest, "BAD_REQUEST", "Invalid request body")
		return
	}

	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	if req.Email == "" {
		apierr.Render(w, http.StatusBadRequest, "INVALID_INPUT", "Email is required")
		return
	}

	// Check if user exists
	_, _, _, err := h.hub.Store.GetUserByEmail(r.Context(), req.Email)
	if err != nil {
		// ponytail: return success even if user not found to prevent email enumeration/harvesting.
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"message": "If the email is registered, a reset code has been sent."})
		return
	}

	// Generate a secure 6-character hex token (3 bytes)
	tokenBytes := make([]byte, 3)
	_, _ = rand.Read(tokenBytes)
	token := hex.EncodeToString(tokenBytes)

	// Token expires in 1 hour
	expiresAt := time.Now().Add(1 * time.Hour)

	if err := h.hub.Store.SaveResetToken(r.Context(), req.Email, token, expiresAt); err != nil {
		slog.Error("Failed to save reset token", "email", req.Email, "error", err)
		apierr.Render(w, http.StatusInternalServerError, "SERVER_ERROR", "Internal server error")
		return
	}

	// Send the reset email using the Google Gmail API mailer
	if h.mailer != nil {
		if err := h.mailer.SendResetEmail(req.Email, token); err != nil {
			slog.Error("Failed to send reset email", "email", req.Email, "error", err)
			apierr.Render(w, http.StatusInternalServerError, "SERVER_ERROR", "Could not send reset email")
			return
		}
	} else {
		slog.Info("Mailer not configured, skipping reset email delivery (OK for tests)", "email", req.Email, "token", token)
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"message": "If the email is registered, a reset code has been sent."})
}

type resetPasswordRequest struct {
	Token    string `json:"token"`
	Password string `json:"password"`
}

// ResetPassword validates the reset token and updates the user's password.
func (h *Handler) ResetPassword(w http.ResponseWriter, r *http.Request) {
	var req resetPasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		apierr.Render(w, http.StatusBadRequest, "BAD_REQUEST", "Invalid request body")
		return
	}

	req.Token = strings.TrimSpace(req.Token)
	req.Password = strings.TrimSpace(req.Password)
	if req.Token == "" || req.Password == "" {
		apierr.Render(w, http.StatusBadRequest, "INVALID_INPUT", "Token and new password are required")
		return
	}

	if len(req.Password) < 6 {
		apierr.Render(w, http.StatusBadRequest, "INVALID_PASSWORD", "Password must be at least 6 characters")
		return
	}

	email, expiresAt, err := h.hub.Store.GetUserByResetToken(r.Context(), req.Token)
	if err != nil {
		apierr.Render(w, http.StatusBadRequest, "INVALID_TOKEN", "Invalid or expired token")
		return
	}

	if time.Now().After(expiresAt) {
		apierr.Render(w, http.StatusBadRequest, "EXPIRED_TOKEN", "Reset token has expired")
		return
	}

	// Hash new password using bcrypt
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		slog.Error("Failed to hash new password", "error", err)
		apierr.Render(w, http.StatusInternalServerError, "SERVER_ERROR", "Internal server error")
		return
	}

	// Update user's password and clear the reset token
	if err := h.hub.Store.UpdateUserPasswordAndClearToken(r.Context(), email, string(hash)); err != nil {
		slog.Error("Failed to update user password", "email", email, "error", err)
		apierr.Render(w, http.StatusInternalServerError, "SERVER_ERROR", "Internal server error")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok", "message": "Password has been reset successfully."})
}

// CreateRoomInvite returns a reusable invite token for a room member.
func (h *Handler) CreateRoomInvite(w http.ResponseWriter, r *http.Request) {
	userID, ok := appmw.GetUserID(r.Context())
	if !ok || userID == "" {
		apierr.Render(w, http.StatusUnauthorized, "UNAUTHORIZED", "User must be authenticated")
		return
	}

	roomID := strings.TrimSpace(chi.URLParam(r, "roomID"))
	if roomID == "" {
		apierr.Render(w, http.StatusBadRequest, "INVALID_INPUT", "Room ID is required")
		return
	}

	isMember, err := h.hub.Store.IsRoomMember(r.Context(), roomID, userID)
	if err != nil {
		slog.Error("Failed to check room membership before invite", "room", roomID, "user", userID, "error", err)
		apierr.Render(w, http.StatusInternalServerError, "DB_ERROR", "Could not verify room membership")
		return
	}
	if !isMember {
		apierr.Render(w, http.StatusForbidden, "FORBIDDEN", "Join the room before sharing it")
		return
	}

	candidate, err := randomHex(24)
	if err != nil {
		slog.Error("Failed to create invite token", "room", roomID, "error", err)
		apierr.Render(w, http.StatusInternalServerError, "INVITE_ERROR", "Could not create invite")
		return
	}

	token, err := h.hub.Store.GetOrCreateRoomInvite(r.Context(), roomID, candidate)
	if err != nil {
		slog.Error("Failed to persist invite token", "room", roomID, "error", err)
		apierr.Render(w, http.StatusInternalServerError, "INVITE_ERROR", "Could not create invite")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"roomId": roomID, "token": token})
}

// JoinRoomInvite joins a room using a share invite token.
func (h *Handler) JoinRoomInvite(w http.ResponseWriter, r *http.Request) {
	userID, ok := appmw.GetUserID(r.Context())
	if !ok || userID == "" {
		apierr.Render(w, http.StatusUnauthorized, "UNAUTHORIZED", "User must be authenticated")
		return
	}

	var req roomInviteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		apierr.Render(w, http.StatusBadRequest, "BAD_REQUEST", "Invalid request body")
		return
	}

	req.Token = strings.TrimSpace(req.Token)
	if req.Token == "" {
		apierr.Render(w, http.StatusBadRequest, "INVALID_INPUT", "Invite token is required")
		return
	}

	roomID, err := h.hub.Store.GetRoomByInviteToken(r.Context(), req.Token)
	if err != nil {
		apierr.Render(w, http.StatusNotFound, "INVITE_NOT_FOUND", "Invite link is invalid")
		return
	}

	name, _, err := h.hub.Store.GetUser(r.Context(), userID)
	if err != nil {
		name = userID
	}

	if err := h.hub.Store.UpsertRoomMember(r.Context(), roomID, userID, name); err != nil {
		slog.Error("Failed to join room via invite", "room", roomID, "user", userID, "error", err)
		apierr.Render(w, http.StatusInternalServerError, "JOIN_ROOM_FAILED", "Could not join room")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok", "roomId": roomID})
}
