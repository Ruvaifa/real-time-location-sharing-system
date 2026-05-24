package websocket

import (
	"context"
	"encoding/json"
	"log"
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
}

// NewHub allocates a Hub ready to Run().
func NewHub(maxGroupSize, maxMsgRate int, store storage.Store) *Hub {
	return &Hub{
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
	}
}

// Stop signals the Run loop to exit.
func (h *Hub) Stop() {
	close(h.Quit)
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
			log.Println("Hub stopping, closing all connections...")
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

	log.Printf("Registering client %s to group %s", client.UserID, client.GroupID)

	// Enforce max group size.
	if len(h.groups[client.GroupID]) >= h.MaxGroupSize {
		log.Printf("group %s full (%d), rejecting %s", client.GroupID, h.MaxGroupSize, client.UserID)
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
		tripBytes, err := json.Marshal(trip)
		if err == nil {
			wrapped := model.Envelope{Type: model.MsgTypeTripCreate, Payload: tripBytes}
			wrappedBytes, err := json.Marshal(wrapped)
			if err == nil {
				select {
				case client.Send <- wrappedBytes:
				default:
				}
			}
		}
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
		log.Printf("[BROADCAST] bad envelope from %s: %v (first 200 bytes: %s)", message.Sender.UserID, err, string(message.Payload[:min(len(message.Payload), 200)]))
		return
	}

	log.Printf("[BROADCAST] type=%q from %s in group %s", env.Type, message.Sender.UserID, message.Sender.GroupID)

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
	default:
		log.Printf("unknown message type %q from %s", env.Type, message.Sender.UserID)
	}
}

func (h *Hub) handleLocation(sender *Client, payload json.RawMessage) {
	var loc model.LocationMessage
	if err := json.Unmarshal(payload, &loc); err != nil {
		log.Printf("bad payload from %s: %v", sender.UserID, err)
		return
	}

	// Trust the socket identity, NOT the payload.
	loc.UserID = sender.UserID
	loc.GroupID = sender.GroupID
	loc.Timestamp = time.Now().UnixMilli()

	if err := validate.Location(loc); err != nil {
		log.Printf("invalid location from %s: %v", loc.UserID, err)
		return
	}

	// Update cache.
	if _, ok := h.cache[loc.GroupID]; !ok {
		h.cache[loc.GroupID] = make(map[string]model.LocationMessage)
	}
	h.cache[loc.GroupID][loc.UserID] = loc

	// Persist asynchronously.
	if h.Store != nil {
		locCopy := loc
		go h.persistLocation(locCopy)
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
			log.Printf("send buffer full for %s, dropping location", client.UserID)
		}
	}
}

func (h *Hub) handleTripCreate(sender *Client, payload json.RawMessage) {
	log.Printf("[TRIP] trip_create from %s in group %s (payload %d bytes)", sender.UserID, sender.GroupID, len(payload))
	var trip model.Trip
	if err := json.Unmarshal(payload, &trip); err != nil {
		log.Printf("[TRIP] bad trip_create from %s: %v", sender.UserID, err)
		return
	}

	// Server-trusted fields.
	trip.CreatorID = sender.UserID
	trip.GroupID = sender.GroupID
	trip.Status = model.TripStatusPlanning
	trip.Participants = []string{sender.UserID}
	trip.CreatedAt = time.Now().UnixMilli()

	if err := validate.TripCreate(&trip); err != nil {
		log.Printf("[TRIP] invalid trip from %s: %v", sender.UserID, err)
		return
	}

	log.Printf("[TRIP] broadcasting trip_created: routeGeometry len=%d, dest=(%f,%f)", len(trip.RouteGeometry), trip.DestLat, trip.DestLng)

	// Persist to DB.
	if h.Store != nil {
		if err := h.Store.CreateTrip(context.Background(), &trip); err != nil {
			log.Printf("[TRIP] db create trip error: %v", err)
		}
	}

	h.trips[sender.GroupID] = &trip
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
			log.Printf("db update participants error: %v", err)
		}
	}

	h.broadcastToGroup(sender.GroupID, model.MsgTypeTripJoin, trip, nil)
}

func (h *Hub) handleTripLeave(sender *Client) {
	h.removeTripParticipant(sender.GroupID, sender.UserID)
}

func (h *Hub) handleTripStart(sender *Client) {
	trip, ok := h.trips[sender.GroupID]
	if !ok || trip.CreatorID != sender.UserID {
		return
	}

	trip.Status = model.TripStatusActive
	now := time.Now().UnixMilli()
	trip.StartedAt = &now

	h.broadcastToGroup(sender.GroupID, model.MsgTypeTripStart, trip, nil)
}

func (h *Hub) handleTripEnd(sender *Client) {
	trip, ok := h.trips[sender.GroupID]
	if !ok || trip.CreatorID != sender.UserID {
		return
	}

	trip.Status = model.TripStatusCompleted
	now := time.Now().UnixMilli()
	trip.EndedAt = &now

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
			log.Printf("db update participants error: %v", err)
		}
	}

	h.broadcastToGroup(groupID, model.MsgTypeTripLeave, trip, nil)
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
		log.Printf("db upsert user error (user=%s): %v", loc.UserID, err)
		return
	}
	if err := h.Store.InsertLocation(ctx, loc); err != nil {
		log.Printf("db insert location error (user=%s): %v", loc.UserID, err)
	}
}
