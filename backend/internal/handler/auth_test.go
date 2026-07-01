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
	"golang.org/x/crypto/bcrypt"
)

type fakeAuthStore struct {
	fakeChatStore
	users map[string]*testUser
}

type testUser struct {
	id           string
	name         string
	email        string
	passwordHash string
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
}
