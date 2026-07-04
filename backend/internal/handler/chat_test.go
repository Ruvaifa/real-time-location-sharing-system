package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"

	appmw "location-sharing-backend/internal/middleware"
	"location-sharing-backend/internal/model"
	"location-sharing-backend/internal/websocket"
)

type fakeChatStore struct {
	isMember bool
	messages []model.ChatMessage
	limit    int
	before   int64
}

func (f *fakeChatStore) UpsertUser(context.Context, string, string) error        { return nil }
func (f *fakeChatStore) GetUser(context.Context, string) (string, string, error) { return "", "", nil }
func (f *fakeChatStore) GetUserByEmail(context.Context, string) (string, string, string, error) {
	return "", "", "", nil
}
func (f *fakeChatStore) CreateUser(context.Context, string, string, string, string) error { return nil }
func (f *fakeChatStore) CreateRoom(context.Context, string, string, string) error         { return nil }
func (f *fakeChatStore) GetRoomPasswordHash(context.Context, string) (string, error)      { return "", nil }
func (f *fakeChatStore) GetOrCreateRoomInvite(context.Context, string, string) (string, error) {
	return "", nil
}
func (f *fakeChatStore) GetRoomByInviteToken(context.Context, string) (string, error) {
	return "", nil
}
func (f *fakeChatStore) InsertLocation(context.Context, model.LocationMessage) error { return nil }
func (f *fakeChatStore) PruneLocations(context.Context, int) (int64, error)          { return 0, nil }
func (f *fakeChatStore) CreateTrip(context.Context, *model.Trip) error               { return nil }
func (f *fakeChatStore) GetActiveTripByGroup(context.Context, string) (*model.Trip, error) {
	return nil, nil
}
func (f *fakeChatStore) UpdateTripStatus(context.Context, string, string) error         { return nil }
func (f *fakeChatStore) UpdateTripParticipants(context.Context, string, []string) error { return nil }
func (f *fakeChatStore) UpsertRoomMember(context.Context, string, string, string) error { return nil }
func (f *fakeChatStore) IsRoomMember(context.Context, string, string) (bool, error) {
	return f.isMember, nil
}
func (f *fakeChatStore) CreateChatMessage(context.Context, *model.ChatMessage) error { return nil }
func (f *fakeChatStore) ListChatMessages(_ context.Context, _ string, limit int, before int64) ([]model.ChatMessage, error) {
	f.limit = limit
	f.before = before
	return f.messages, nil
}
func (f *fakeChatStore) ListPrivateChatMessages(_ context.Context, _ string, _, _ string, limit int, before int64) ([]model.ChatMessage, error) {
	f.limit = limit
	f.before = before
	return f.messages, nil
}
func (f *fakeChatStore) Ping(context.Context) error { return nil }
func (f *fakeChatStore) Close() error               { return nil }

func TestGetGroupMessagesRequiresMembership(t *testing.T) {
	store := &fakeChatStore{isMember: false}
	h := &Handler{hub: &websocket.Hub{Store: store}}

	rr := httptest.NewRecorder()
	h.GetGroupMessages(rr, chatRequest("room-a", "alice", ""))

	if rr.Code != http.StatusForbidden {
		t.Fatalf("expected status %d, got %d", http.StatusForbidden, rr.Code)
	}
}

func TestGetGroupMessagesReturnsItemsAndPagination(t *testing.T) {
	store := &fakeChatStore{
		isMember: true,
		messages: []model.ChatMessage{
			{MessageID: "m1", GroupID: "room-a", UserID: "alice", Username: "alice", Text: "hello", Kind: model.ChatKindText, Timestamp: 10},
			{MessageID: "m2", GroupID: "room-a", UserID: "bob", Username: "bob", Text: "hey", Kind: model.ChatKindText, Timestamp: 20},
		},
	}
	h := &Handler{hub: &websocket.Hub{Store: store}}

	rr := httptest.NewRecorder()
	h.GetGroupMessages(rr, chatRequest("room-a", "alice", "?limit=250&before=12345"))

	if rr.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, rr.Code)
	}
	if store.limit != maxChatHistoryLimit {
		t.Fatalf("expected capped limit %d, got %d", maxChatHistoryLimit, store.limit)
	}
	if store.before != 12345 {
		t.Fatalf("expected before 12345, got %d", store.before)
	}

	var body chatHistoryResponse
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(body.Items) != 2 {
		t.Fatalf("expected 2 messages, got %d", len(body.Items))
	}
	if body.Items[0].MessageID != "m1" || body.Items[1].MessageID != "m2" {
		t.Fatalf("messages were not returned in store order: %#v", body.Items)
	}
}

func TestGetGroupMessagesRejectsInvalidLimit(t *testing.T) {
	store := &fakeChatStore{isMember: true}
	h := &Handler{hub: &websocket.Hub{Store: store}}

	rr := httptest.NewRecorder()
	h.GetGroupMessages(rr, chatRequest("room-a", "alice", "?limit=bad"))

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d", http.StatusBadRequest, rr.Code)
	}
}

func chatRequest(groupID, userID, rawQuery string) *http.Request {
	req := httptest.NewRequest(http.MethodGet, "/api/groups/"+groupID+"/messages"+rawQuery, nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("groupID", groupID)
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = context.WithValue(ctx, appmw.UserIDKey, userID)
	return req.WithContext(ctx)
}
