package websocket

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"sync"
	"time"

	"location-sharing-backend/internal/model"
	"location-sharing-backend/internal/storage"
	"location-sharing-backend/internal/validate"
)

// HubMessage wraps a raw payload with its sender so the Hub can skip echoing
// back to the originator.
type HubMessage struct {
	Sender  *Client
	Payload []byte
}

// TripQuery is used to request the active trip for a group via a channel.
type TripQuery struct {
	GroupID string
	Trip    chan *model.Trip
}

// generateID produces a 16-byte random hex string (UUID v4-like).
func generateID() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		panic("crypto/rand unavailable: " + err.Error())
	}
	return hex.EncodeToString(b[:])
}

// Hub maintains the set of active clients grouped by room and broadcasts
// messages to peers. All map mutations happen inside Run()'s select loop,
// so no mutex is needed.
type Hub struct {
	groups map[string]map[*Client]bool
	cache  map[string]map[string]model.LocationMessage
	trips  map[string]*model.Trip

	Register   chan *Client
	Unregister chan *Client
	Broadcast  chan HubMessage
	TripQuery  chan TripQuery

	Quit         chan struct{}
	MaxGroupSize int
	MaxMsgRate   int
	Store        storage.Store

	persistCh   chan model.LocationMessage
	persistDone chan struct{}
}

// NewHub allocates a Hub ready to Run().
func NewHub(maxGroupSize, maxMsgRate int, store storage.Store) *Hub {
	h := &Hub{
		groups:       make(map[string]map[*Client]bool),
		cache:        make(map[string]map[string]model.LocationMessage),
		trips:        make(map[string]*model.Trip),
		Register:     make(chan *Client),
		Unregister:   make(chan *Client),
		Broadcast:    make(chan HubMessage, 256),
		TripQuery:    make(chan TripQuery),
		Quit:         make(chan struct{}),
		MaxGroupSize: maxGroupSize,
		MaxMsgRate:   maxMsgRate,
		Store:        store,
		persistCh:    make(chan model.LocationMessage, 512),
		persistDone:  make(chan struct{}),
	}

	// Start bounded persistence workers.
	if store != nil {
		const numWorkers = 4
		var wg sync.WaitGroup
		wg.Add(numWorkers)
		h.persistDone = make(chan struct{})
		for i := 0; i < numWorkers; i++ {
			go func() {
				defer wg.Done()
				for loc := range h.persistCh {
					h.persistLocation(loc)
				}
			}()
		}
		go func() {
			wg.Wait()
			close(h.persistDone)
		}()
	}

	return h
}

// Stop signals the Run loop to exit and waits for persistence workers to drain.
func (h *Hub) Stop() {
	close(h.Quit)
	if h.Store != nil {
		close(h.persistCh)
		<-h.persistDone
	}
}

// GetActiveTrip returns the active trip for a group via the hub's event loop.
func (h *Hub) GetActiveTrip(groupID string) (*model.Trip, error) {
	q := TripQuery{GroupID: groupID, Trip: make(chan *model.Trip, 1)}
	h.TripQuery <- q
	return <-q.Trip, nil
}

// Run is the hub's main event loop. It must be started in its own goroutine.
func (h *Hub) Run() {
	for {
		select {
		case client := <-h.Register:
			h.handleRegister(client)

		case client := <-h.Unregister:
			h.handleUnregister(client)

		case message := <-h.Broadcast:
			h.handleBroadcast(message)

		case query := <-h.TripQuery:
			trip, ok := h.trips[query.GroupID]
			if ok {
				query.Trip <- trip
			} else {
				query.Trip <- nil
			}

		case <-h.Quit:
			slog.Info("Hub stopping, closing all connections")
			for _, group := range h.groups {
				for client := range group {
					h.handleUnregister(client)
				}
			}
			return
		}
	}
}

func (h *Hub) handleRegister(client *Client) {
	if _, ok := h.groups[client.GroupID]; !ok {
		h.groups[client.GroupID] = make(map[*Client]bool)
		h.cache[client.GroupID] = make(map[string]model.LocationMessage)
	}

	slog.Debug("Registering client", "user", client.UserID, "group", client.GroupID)

	// Enforce max group size.
	if len(h.groups[client.GroupID]) >= h.MaxGroupSize {
		slog.Warn("Group full, rejecting client", "group", client.GroupID, "max", h.MaxGroupSize, "user", client.UserID)
		client.CloseSend()
		return
	}

	h.groups[client.GroupID][client] = true

	// Replay cached locations to the new joiner.
	for _, loc := range h.cache[client.GroupID] {
		msg, err := json.Marshal(loc)
		if err != nil {
			continue
		}
		wrapped := model.Envelope{Type: model.MsgTypeLocation, Payload: msg}
		wrappedBytes, err := json.Marshal(wrapped)
		if err != nil {
			continue
		}
		select {
		case client.Send <- wrappedBytes:
		default:
			client.CloseSend()
			delete(h.groups[client.GroupID], client)
			return
		}
	}

	// Replay active trip to the new joiner.
	if trip, ok := h.trips[client.GroupID]; ok {
		slog.Info("Replaying trip to new joiner", "user", client.UserID, "group", client.GroupID, "trip_id", trip.ID, "status", trip.Status)
		tripBytes, err := json.Marshal(trip)
		if err == nil {
			wrapped := model.Envelope{Type: model.MsgTypeTripCreate, Payload: tripBytes}
			wrappedBytes, err := json.Marshal(wrapped)
			if err == nil {
				select {
				case client.Send <- wrappedBytes:
				default:
					slog.Warn("Failed to replay trip, send buffer full", "user", client.UserID)
				}
			}
		}
	} else {
		slog.Debug("No trip to replay", "user", client.UserID, "group", client.GroupID)
	}
}

func (h *Hub) handleUnregister(client *Client) {
	group, ok := h.groups[client.GroupID]
	if !ok {
		return
	}
	if _, exists := group[client]; !exists {
		return
	}

	delete(group, client)
	client.CloseSend()

	// Auto-leave trip if user was in one.
	if trip, ok := h.trips[client.GroupID]; ok && trip.Status != model.TripStatusCompleted {
		h.removeTripParticipant(client.GroupID, client.UserID)
	}

	// Remove from cache.
	if cg, ok := h.cache[client.GroupID]; ok {
		delete(cg, client.UserID)
	}

	// Notify remaining peers.
	disconnect := model.LocationMessage{
		UserID:    client.UserID,
		GroupID:   client.GroupID,
		Offline:   true,
		Timestamp: time.Now().UnixMilli(),
	}
	if msg, err := json.Marshal(disconnect); err == nil {
		wrapped := model.Envelope{Type: model.MsgTypeLocation, Payload: msg}
		if wrappedBytes, err := json.Marshal(wrapped); err == nil {
			for c := range group {
				select {
				case c.Send <- wrappedBytes:
				default:
				}
			}
		}
	}

	// Garbage-collect empty groups.
	if len(group) == 0 {
		delete(h.groups, client.GroupID)
		delete(h.cache, client.GroupID)
		delete(h.trips, client.GroupID)
	}
}

func (h *Hub) handleBroadcast(message HubMessage) {
	var env model.Envelope
	if err := json.Unmarshal(message.Payload, &env); err != nil {
		slog.Warn("Bad envelope from client", "user", message.Sender.UserID, "error", err, "payload_prefix", string(message.Payload[:min(len(message.Payload), 200)]))
		return
	}

	slog.Debug("Broadcast received", "type", env.Type, "user", message.Sender.UserID, "group", message.Sender.GroupID)

	switch env.Type {
	case model.MsgTypeLocation, "":
		h.handleLocation(message.Sender, env.Payload)
	case model.MsgTypeTripCreate:
		h.handleTripCreate(message.Sender, env.Payload)
	case model.MsgTypeTripJoin:
		h.handleTripJoin(message.Sender)
	case model.MsgTypeTripLeave:
		h.handleTripLeave(message.Sender)
	case model.MsgTypeTripStart:
		h.handleTripStart(message.Sender)
	case model.MsgTypeTripEnd:
		h.handleTripEnd(message.Sender)
	case model.MsgTypeChatMessage:
		h.handleChatMessage(message.Sender, env.Payload)
	default:
		slog.Warn("Unknown message type", "type", env.Type, "user", message.Sender.UserID)
	}
}

func (h *Hub) handleLocation(sender *Client, payload json.RawMessage) {
	var loc model.LocationMessage
	if err := json.Unmarshal(payload, &loc); err != nil {
		slog.Warn("Bad location payload", "user", sender.UserID, "error", err)
		return
	}

	// Trust the socket identity, NOT the payload.
	loc.UserID = sender.UserID
	loc.GroupID = sender.GroupID
	loc.Timestamp = time.Now().UnixMilli()

	if err := validate.Location(loc); err != nil {
		slog.Warn("Invalid location", "user", loc.UserID, "error", err)
		return
	}

	// Update cache.
	if _, ok := h.cache[loc.GroupID]; !ok {
		h.cache[loc.GroupID] = make(map[string]model.LocationMessage)
	}
	h.cache[loc.GroupID][loc.UserID] = loc

	// Persist via bounded worker pool.
	if h.Store != nil {
		select {
		case h.persistCh <- loc:
		default:
			slog.Warn("Persist buffer full, dropping location", "user", loc.UserID)
		}
	}

	// Re-marshal the sanitized message.
	clean, err := json.Marshal(loc)
	if err != nil {
		return
	}

	wrapped := model.Envelope{Type: model.MsgTypeLocation, Payload: clean}
	wrappedBytes, err := json.Marshal(wrapped)
	if err != nil {
		return
	}

	group, ok := h.groups[sender.GroupID]
	if !ok {
		return
	}

	for client := range group {
		if client == sender {
			continue
		}
		select {
		case client.Send <- wrappedBytes:
		default:
			slog.Warn("Send buffer full, dropping location", "user", client.UserID)
		}
	}
}

func (h *Hub) handleTripCreate(sender *Client, payload json.RawMessage) {
	slog.Info("Trip create request", "user", sender.UserID, "group", sender.GroupID, "payload_bytes", len(payload))
	var trip model.Trip
	if err := json.Unmarshal(payload, &trip); err != nil {
		slog.Warn("Bad trip_create payload", "user", sender.UserID, "error", err)
		return
	}

	// Server-trusted fields — always override client-supplied values.
	trip.ID = generateID()
	trip.CreatorID = sender.UserID
	trip.GroupID = sender.GroupID
	trip.Status = model.TripStatusPlanning
	trip.Participants = []string{sender.UserID}
	trip.CreatedAt = time.Now().UnixMilli()

	if err := validate.TripCreate(&trip); err != nil {
		slog.Warn("Invalid trip_create", "user", sender.UserID, "error", err)
		return
	}

	slog.Info("Trip created, broadcasting",
		"trip_id", trip.ID,
		"creator", trip.CreatorID,
		"status", trip.Status,
		"route_geometry_len", len(trip.RouteGeometry),
		"dest_lat", trip.DestLat,
		"dest_lng", trip.DestLng,
	)

	// Persist to DB.
	if h.Store != nil {
		if err := h.Store.CreateTrip(context.Background(), &trip); err != nil {
			slog.Error("Failed to create trip in DB", "trip_id", trip.ID, "error", err)
		}
	}

	h.trips[sender.GroupID] = &trip
	slog.Info("Trip stored in hub", "group", sender.GroupID, "trip_id", trip.ID, "total_trips", len(h.trips))
	h.broadcastToGroup(sender.GroupID, model.MsgTypeTripCreate, trip, nil)
}

func (h *Hub) handleTripJoin(sender *Client) {
	trip, ok := h.trips[sender.GroupID]
	if !ok || trip.Status == model.TripStatusCompleted {
		return
	}

	for _, uid := range trip.Participants {
		if uid == sender.UserID {
			return // already joined
		}
	}

	trip.Participants = append(trip.Participants, sender.UserID)

	if h.Store != nil {
		if err := h.Store.UpdateTripParticipants(context.Background(), trip.ID, trip.Participants); err != nil {
			slog.Error("Failed to update trip participants", "trip_id", trip.ID, "error", err)
		}
	}

	h.broadcastToGroup(sender.GroupID, model.MsgTypeTripJoin, trip, nil)
}

func (h *Hub) handleTripLeave(sender *Client) {
	h.removeTripParticipant(sender.GroupID, sender.UserID)
}

func (h *Hub) handleTripStart(sender *Client) {
	trip, ok := h.trips[sender.GroupID]
	if !ok {
		slog.Warn("trip_start: no trip found", "user", sender.UserID, "group", sender.GroupID)
		return
	}
	if trip.CreatorID != sender.UserID {
		slog.Warn("trip_start: not creator", "user", sender.UserID, "creator", trip.CreatorID)
		return
	}

	trip.Status = model.TripStatusActive
	now := time.Now().UnixMilli()
	trip.StartedAt = &now

	slog.Info("Trip started", "trip_id", trip.ID, "user", sender.UserID)
	h.broadcastToGroup(sender.GroupID, model.MsgTypeTripStart, trip, nil)
}

func (h *Hub) handleTripEnd(sender *Client) {
	trip, ok := h.trips[sender.GroupID]
	if !ok {
		slog.Warn("trip_end: no trip found", "user", sender.UserID, "group", sender.GroupID, "trips_keys", len(h.trips))
		return
	}
	if trip.CreatorID != sender.UserID {
		slog.Warn("trip_end: not creator", "user", sender.UserID, "creator", trip.CreatorID)
		return
	}

	trip.Status = model.TripStatusCompleted
	now := time.Now().UnixMilli()
	trip.EndedAt = &now

	slog.Info("Trip ended, broadcasting", "trip_id", trip.ID, "user", sender.UserID)
	h.broadcastToGroup(sender.GroupID, model.MsgTypeTripEnd, trip, nil)
	delete(h.trips, sender.GroupID)
}

func (h *Hub) removeTripParticipant(groupID, userID string) {
	trip, ok := h.trips[groupID]
	if !ok || trip.Status == model.TripStatusCompleted {
		return
	}

	newParticipants := make([]string, 0, len(trip.Participants))
	for _, uid := range trip.Participants {
		if uid != userID {
			newParticipants = append(newParticipants, uid)
		}
	}
	trip.Participants = newParticipants

	if h.Store != nil {
		if err := h.Store.UpdateTripParticipants(context.Background(), trip.ID, trip.Participants); err != nil {
			slog.Error("Failed to update trip participants on leave", "trip_id", trip.ID, "error", err)
		}
	}

	h.broadcastToGroup(groupID, model.MsgTypeTripLeave, trip, nil)
}

func (h *Hub) handleChatMessage(sender *Client, payload json.RawMessage) {
	var msg model.ChatMessage
	if err := json.Unmarshal(payload, &msg); err != nil {
		slog.Warn("Bad chat payload", "user", sender.UserID, "group", sender.GroupID, "error", err)
		return
	}

	// Trust the socket identity, not client-supplied sender metadata.
	msg.MessageID = generateID()
	msg.GroupID = sender.GroupID
	msg.UserID = sender.UserID
	msg.Username = sender.UserID
	msg.Timestamp = time.Now().UnixMilli()

	if err := validate.ChatMessage(&msg); err != nil {
		slog.Warn("Invalid chat message", "user", sender.UserID, "group", sender.GroupID, "error", err)
		return
	}

	if h.Store == nil {
		slog.Error("Chat message rejected because store is unavailable", "user", sender.UserID, "group", sender.GroupID)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	if err := h.Store.UpsertRoomMember(ctx, sender.GroupID, sender.UserID, sender.UserID); err != nil {
		slog.Error("Failed to refresh room membership before chat persist", "user", sender.UserID, "group", sender.GroupID, "error", err)
		return
	}
	if err := h.Store.CreateChatMessage(ctx, &msg); err != nil {
		slog.Error("Failed to persist chat message", "user", sender.UserID, "group", sender.GroupID, "error", err)
		return
	}

	h.broadcastToGroup(sender.GroupID, model.MsgTypeChatMessage, msg, nil)
}

func (h *Hub) broadcastToGroup(groupID, msgType string, data interface{}, exclude *Client) {
	raw, err := json.Marshal(data)
	if err != nil {
		return
	}
	wrapped := model.Envelope{Type: msgType, Payload: raw}
	wrappedBytes, err := json.Marshal(wrapped)
	if err != nil {
		return
	}

	group, ok := h.groups[groupID]
	if !ok {
		return
	}

	for client := range group {
		if client == exclude {
			continue
		}
		select {
		case client.Send <- wrappedBytes:
		default:
		}
	}
}

func (h *Hub) persistLocation(loc model.LocationMessage) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	if err := h.Store.UpsertUser(ctx, loc.UserID, loc.Name); err != nil {
		slog.Error("Failed to upsert user", "user", loc.UserID, "error", err)
		return
	}
	if err := h.Store.InsertLocation(ctx, loc); err != nil {
		slog.Error("Failed to insert location", "user", loc.UserID, "error", err)
	}
}
