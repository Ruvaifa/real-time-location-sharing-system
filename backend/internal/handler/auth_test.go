package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"location-sharing-backend/internal/auth"
	"location-sharing-backend/internal/websocket"
	"time"
	"golang.org/x/crypto/bcrypt"
)

type fakeAuthStore struct {
	fakeChatStore
	users map[string]*testUser
}

type testUser struct {
	id                  string
	name                string
	email               string
	passwordHash        string
	resetToken          string
	resetTokenExpiresAt time.Time
}

func (s *fakeAuthStore) CreateUser(ctx context.Context, userID, name, email, passwordHash string) error {
	for _, u := range s.users {
		if u.email == email {
			return &mockDBError{msg: "duplicate key value violates unique constraint"}
		}
	}
	s.users[userID] = &testUser{
		id:           userID,
		name:         name,
		email:        email,
		passwordHash: passwordHash,
	}
	return nil
}

func (s *fakeAuthStore) GetUserByEmail(ctx context.Context, email string) (string, string, string, error) {
	for _, u := range s.users {
		if u.email == email {
			return u.id, u.name, u.passwordHash, nil
		}
	}
	return "", "", "", http.ErrNoLocation
}

func (s *fakeAuthStore) SaveResetToken(ctx context.Context, email, token string, expiresAt time.Time) error {
	for _, u := range s.users {
		if u.email == email {
			u.resetToken = token
			u.resetTokenExpiresAt = expiresAt
			return nil
		}
	}
	return http.ErrNoLocation
}

func (s *fakeAuthStore) GetUserByResetToken(ctx context.Context, token string) (string, time.Time, error) {
	for _, u := range s.users {
		if u.resetToken == token {
			return u.email, u.resetTokenExpiresAt, nil
		}
	}
	return "", time.Time{}, http.ErrNoLocation
}

func (s *fakeAuthStore) UpdateUserPasswordAndClearToken(ctx context.Context, email, passwordHash string) error {
	for _, u := range s.users {
		if u.email == email {
			u.passwordHash = passwordHash
			u.resetToken = ""
			u.resetTokenExpiresAt = time.Time{}
			return nil
		}
	}
	return http.ErrNoLocation
}

type mockDBError struct {
	msg string
}

func (e *mockDBError) Error() string {
	return e.msg
}

func TestSignupAndLoginFlow(t *testing.T) {
	store := &fakeAuthStore{users: make(map[string]*testUser)}
	tm := auth.NewTokenManager("test-secret-key-must-be-long-enough-32")
	h := &Handler{
		hub: &websocket.Hub{Store: store},
		tm:  tm,
	}

	// 1. Test Signup
	signupData := map[string]string{
		"email":    "test@example.com",
		"password": "mypassword",
		"name":     "Test User",
	}
	body, _ := json.Marshal(signupData)
	req := httptest.NewRequest(http.MethodPost, "/api/auth/signup", bytes.NewBuffer(body))
	rr := httptest.NewRecorder()

	h.Signup(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected status OK, got %d. Body: %s", rr.Code, rr.Body.String())
	}

	var resp authResponse
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if resp.Token == "" {
		t.Fatal("expected non-empty token")
	}

	if resp.User.Email != "test@example.com" || resp.User.Name != "Test User" {
		t.Fatalf("unexpected user details: %+v", resp.User)
	}

	// Verify password hash in fake DB
	storedUser := store.users[resp.User.ID]
	if storedUser == nil {
		t.Fatal("user not stored in database")
	}
	err := bcrypt.CompareHashAndPassword([]byte(storedUser.passwordHash), []byte("mypassword"))
	if err != nil {
		t.Fatalf("stored password hash invalid: %v", err)
	}

	// 2. Test Login
	loginData := map[string]string{
		"email":    "test@example.com",
		"password": "mypassword",
	}
	body, _ = json.Marshal(loginData)
	req = httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewBuffer(body))
	rr = httptest.NewRecorder()

	h.Login(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected status OK, got %d. Body: %s", rr.Code, rr.Body.String())
	}

	var loginResp authResponse
	if err := json.NewDecoder(rr.Body).Decode(&loginResp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if loginResp.Token == "" {
		t.Fatal("expected non-empty token")
	}

	// 3. Test Invalid Credentials
	loginData["password"] = "wrongpassword"
	body, _ = json.Marshal(loginData)
	req = httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewBuffer(body))
	rr = httptest.NewRecorder()

	h.Login(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("expected status Unauthorized, got %d", rr.Code)
	}

	// 4. Test Forgot Password Request
	forgotData := map[string]string{
		"email": "test@example.com",
	}
	body, _ = json.Marshal(forgotData)
	req = httptest.NewRequest(http.MethodPost, "/api/auth/forgot-password", bytes.NewBuffer(body))
	rr = httptest.NewRecorder()

	h.ForgotPassword(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected status OK on forgot password, got %d", rr.Code)
	}

	// Retrieve reset token directly from database map
	storedUser = store.users[resp.User.ID]
	if storedUser.resetToken == "" {
		t.Fatal("expected reset token to be generated and stored")
	}

	// 5. Test Reset Password
	resetData := map[string]string{
		"token":    storedUser.resetToken,
		"password": "newpassword123",
	}
	body, _ = json.Marshal(resetData)
	req = httptest.NewRequest(http.MethodPost, "/api/auth/reset-password", bytes.NewBuffer(body))
	rr = httptest.NewRecorder()

	h.ResetPassword(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected status OK on reset password, got %d. Body: %s", rr.Code, rr.Body.String())
	}

	// Verify that password hash has updated to hash of "newpassword123"
	storedUser = store.users[resp.User.ID]
	if storedUser.resetToken != "" {
		t.Fatal("expected reset token to be cleared after reset")
	}
	err = bcrypt.CompareHashAndPassword([]byte(storedUser.passwordHash), []byte("newpassword123"))
	if err != nil {
		t.Fatalf("expected new password to match stored hash, got error: %v", err)
	}

	// 6. Test Login with New Password
	loginData["password"] = "newpassword123"
	body, _ = json.Marshal(loginData)
	req = httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewBuffer(body))
	rr = httptest.NewRecorder()

	h.Login(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected successful login with new password, got status %d", rr.Code)
	}
}
