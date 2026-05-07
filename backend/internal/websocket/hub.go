package websocket

import (
	"encoding/json"
	"log"
	"time"

	"location-sharing-backend/internal/model"
	"location-sharing-backend/internal/validate"
)

// HubMessage wraps a payload with its sender identity.
type HubMessage struct {
	Sender  *Client
	Payload []byte
}

// Hub maintains the set of active clients and broadcasts messages to the
// clients.
type Hub struct {
	// Registered clients by GroupID.
	groups map[string]map[*Client]bool

	// Inbound messages from the clients.
	Broadcast chan HubMessage

	// Register requests from the clients.
	Register chan *Client

	// Unregister requests from clients.
	Unregister chan *Client

	// Cached last known location for each user in each group.
	// Map: GroupID -> UserID -> LocationMessage
	cache map[string]map[string]model.LocationMessage

	// Configuration
	MaxGroupSize int
	MaxMsgRate   int // messages per second (TODO: implement rate limiting)
}

func NewHub(maxGroupSize int, maxMsgRate int) *Hub {
	return &Hub{
		Broadcast:    make(chan HubMessage),
		Register:     make(chan *Client),
		Unregister:   make(chan *Client),
		groups:       make(map[string]map[*Client]bool),
		cache:        make(map[string]map[string]model.LocationMessage),
		MaxGroupSize: maxGroupSize,
		MaxMsgRate:   maxMsgRate,
	}
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.Register:
			h.handleRegister(client)

		case client := <-h.Unregister:
			h.handleUnregister(client)

		case message := <-h.Broadcast:
			h.handleBroadcast(message)
		}
	}
}

func (h *Hub) Stop() {
	// In a real app, you might want to close channels or notify clients.
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
		client.Conn.Close()
		return
	}

	h.groups[client.GroupID][client] = true

	// Replay cached locations to the new joiner.
	for _, loc := range h.cache[client.GroupID] {
		msg, err := json.Marshal(loc)
		if err == nil {
			client.Send <- msg
		}
	}
}

func (h *Hub) handleUnregister(client *Client) {
	group, ok := h.groups[client.GroupID]
	if !ok {
		return
	}

	if _, ok := group[client]; ok {
		delete(group, client)
		close(client.Send)

		// Notify others that this user is offline.
		client.SendOfflineMessage()

		// Cleanup empty group and cache.
		if len(group) == 0 {
			delete(h.groups, client.GroupID)
			delete(h.cache, client.GroupID)
		}
	}
}

func (h *Hub) handleBroadcast(message HubMessage) {
	var loc model.LocationMessage
	if err := json.Unmarshal(message.Payload, &loc); err != nil {
		log.Printf("bad payload from %s: %v", message.Sender.UserID, err)
		return
	}

	// Basic validation of coordinates and fields.
	if !loc.Offline {
		if err := validate.Location(loc); err != nil {
			log.Printf("invalid location from %s: %v", message.Sender.UserID, err)
			return
		}
	}

	// Trust the socket identity, NOT the payload.
	loc.UserID = message.Sender.UserID
	loc.GroupID = message.Sender.GroupID
	loc.Timestamp = time.Now().UnixMilli()

	// Update cache.
	if loc.Offline {
		delete(h.cache[loc.GroupID], loc.UserID)
	} else {
		h.cache[loc.GroupID][loc.UserID] = loc
	}

	clean, err := json.Marshal(loc)
	if err != nil {
		return
	}

	group, ok := h.groups[message.Sender.GroupID]
	if !ok {
		log.Printf("Group %s not found for broadcast", message.Sender.GroupID)
		return
	}

	log.Printf("Broadcasting message from %s to %d peers in group %s", loc.UserID, len(group)-1, loc.GroupID)

	for client := range group {
		if client == message.Sender {
			continue
		}
		select {
		case client.Send <- clean:
		default:
			close(client.Send)
			delete(group, client)
		}
	}
}
