package main

import (
	"encoding/json"
	"log"
)

// Hub maintains the set of active clients and broadcasts messages to the clients.
type Hub struct {
	// Outer key = groupID, inner key = *Client
	groups map[string]map[*Client]bool
	// Last known location per (groupID, userID)
	cache      map[string]map[string]LocationMessage
	register   chan *Client
	unregister chan *Client
	broadcast  chan HubMessage
}

// NewHub factory function allocates the hub maps and channels.
func NewHub() *Hub {
	return &Hub{
		groups:     make(map[string]map[*Client]bool),
		cache:      make(map[string]map[string]LocationMessage),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		broadcast:  make(chan HubMessage, 256),
	}
}

// Run serialises all state mutations in a select loop for concurrency safety.
func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			if _, ok := h.groups[client.GroupID]; !ok {
				h.groups[client.GroupID] = make(map[*Client]bool)
				h.cache[client.GroupID] = make(map[string]LocationMessage)
			}
			h.groups[client.GroupID][client] = true

			// Repopulate state cache for new client
			for _, locMsg := range h.cache[client.GroupID] {
				msgBytes, err := json.Marshal(locMsg)
				if err != nil {
					log.Printf("error marshaling cached msg: %v", err)
					continue
				}
				select {
				case client.send <- msgBytes:
				default:
					close(client.send)
					delete(h.groups[client.GroupID], client)
				}
			}

		case client := <-h.unregister:
			if group, ok := h.groups[client.GroupID]; ok {
				if _, ok := group[client]; ok {
					delete(group, client)
					close(client.send)
					if len(group) == 0 {
						delete(h.groups, client.GroupID)
						delete(h.cache, client.GroupID)
					}
				}
			}

		case message := <-h.broadcast:
			var loc LocationMessage
			if err := json.Unmarshal(message.Payload, &loc); err == nil {
				if _, ok := h.cache[loc.GroupID]; !ok {
					h.cache[loc.GroupID] = make(map[string]LocationMessage)
				}
				h.cache[loc.GroupID][loc.UserID] = loc
			} else {
				log.Printf("error unmarshaling broadcast msg: %v", err)
			}

			if group, ok := h.groups[message.Sender.GroupID]; ok {
				for client := range group {
					if client != message.Sender {
						select {
						case client.send <- message.Payload:
						default:
							close(client.send)
							delete(group, client)
							if len(group) == 0 {
								delete(h.groups, message.Sender.GroupID)
								delete(h.cache, message.Sender.GroupID)
							}
						}
					}
				}
			}
		}
	}
}
