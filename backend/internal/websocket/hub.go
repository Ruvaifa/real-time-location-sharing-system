package websocket

import (
	"encoding/json"
	"log"
	"time"

	"location-sharing-backend/internal/model"
	"location-sharing-backend/internal/validate"
)

// HubMessage wraps a raw payload with its sender so the Hub can skip echoing
// back to the originator.
type HubMessage struct {
	Sender  *Client
	Payload []byte
}

// Hub maintains the set of active clients grouped by room and broadcasts
// messages to peers. All map mutations happen inside Run()'s select loop,
// so no mutex is needed.
type Hub struct {
	groups map[string]map[*Client]bool
	cache  map[string]map[string]model.LocationMessage

	Register   chan *Client
	Unregister chan *Client
	Broadcast  chan HubMessage

	MaxGroupSize int
	MaxMsgRate   int

	done chan struct{}
}

// NewHub allocates a Hub ready to Run().
func NewHub(maxGroupSize, maxMsgRate int) *Hub {
	return &Hub{
		groups:       make(map[string]map[*Client]bool),
		cache:        make(map[string]map[string]model.LocationMessage),
		Register:     make(chan *Client),
		Unregister:   make(chan *Client),
		Broadcast:    make(chan HubMessage, 256),
		MaxGroupSize: maxGroupSize,
		MaxMsgRate:   maxMsgRate,
		done:         make(chan struct{}),
	}
}

// Stop signals the Run loop to exit.
func (h *Hub) Stop() {
	close(h.done)
}

// Run is the hub's main event loop. It must be started in its own goroutine.
func (h *Hub) Run() {
	for {
		select {
		case <-h.done:
			// Graceful shutdown: close all client channels.
			for _, group := range h.groups {
				for client := range group {
					client.CloseSend()
				}
			}
			return

		case client := <-h.Register:
			h.handleRegister(client)

		case client := <-h.Unregister:
			h.handleUnregister(client)

		case message := <-h.Broadcast:
			h.handleBroadcast(message)
		}
	}
}

func (h *Hub) handleRegister(client *Client) {
	if _, ok := h.groups[client.GroupID]; !ok {
		h.groups[client.GroupID] = make(map[*Client]bool)
		h.cache[client.GroupID] = make(map[string]model.LocationMessage)
	}

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
		select {
		case client.Send <- msg:
		default:
			// Buffer full on a brand-new client — give up.
			client.CloseSend()
			delete(h.groups[client.GroupID], client)
			return
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
		for c := range group {
			select {
			case c.Send <- msg:
			default:
			}
		}
	}

	// Garbage-collect empty groups.
	if len(group) == 0 {
		delete(h.groups, client.GroupID)
		delete(h.cache, client.GroupID)
	}
}

func (h *Hub) handleBroadcast(message HubMessage) {
	var loc model.LocationMessage
	if err := json.Unmarshal(message.Payload, &loc); err != nil {
		log.Printf("bad payload from %s: %v", message.Sender.UserID, err)
		return
	}

	// Trust the socket identity, NOT the payload.
	loc.UserID = message.Sender.UserID
	loc.GroupID = message.Sender.GroupID
	loc.Timestamp = time.Now().UnixMilli()

	// Validate coordinates and name.
	if err := validate.Location(loc); err != nil {
		log.Printf("invalid location from %s: %v", loc.UserID, err)
		return
	}

	// Update cache.
	if _, ok := h.cache[loc.GroupID]; !ok {
		h.cache[loc.GroupID] = make(map[string]model.LocationMessage)
	}
	h.cache[loc.GroupID][loc.UserID] = loc

	// Re-marshal the sanitized message.
	clean, err := json.Marshal(loc)
	if err != nil {
		return
	}

	group, ok := h.groups[message.Sender.GroupID]
	if !ok {
		return
	}

	for client := range group {
		if client == message.Sender {
			continue
		}
		select {
		case client.Send <- clean:
		default:
			// Buffer full — evict. Don't close here; ReadPump will trigger Unregister.
			log.Printf("send buffer full for %s, evicting", client.UserID)
			delete(group, client)
			delete(h.cache[loc.GroupID], client.UserID)
			if len(group) == 0 {
				delete(h.groups, message.Sender.GroupID)
				delete(h.cache, message.Sender.GroupID)
			}
		}
	}
}
