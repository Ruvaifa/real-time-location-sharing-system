package main

import (
	"encoding/json"
	"log"
)

// Hub maintains the set of active clients and broadcasts messages to the clients.
type Hub struct {
	// groups tracks active connections separated by a GroupID.
	// Outer key = groupID, inner key = physical *Client instance, value = boolean toggle.
	groups map[string]map[*Client]bool
	
	// cache remembers the last reported coordinates so late joiners see markers instantly.
	// Outer key = groupID, inner key = userID, value = LocationMessage.
	cache map[string]map[string]LocationMessage
	
	// Channels which acts as safe mailboxes avoiding Mutex data races:
	register   chan *Client     // Processing clients joining
	unregister chan *Client     // Processing clients disconnecting
	broadcast  chan HubMessage  // Processing new GPS signals to scatter to peers
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
// This function alone is legally allowed to modify maps, effectively sidestepping "concurrent write" crashes.
func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			// 1. A new User connected! If the room doesn't exist, create physical room + cache cleanly.
			if _, ok := h.groups[client.GroupID]; !ok {
				h.groups[client.GroupID] = make(map[*Client]bool)
				h.cache[client.GroupID] = make(map[string]LocationMessage)
			}
			// Mark this client active in this group
			h.groups[client.GroupID][client] = true
			
			// 2. Repopulate state cache for the new client.
			// Sends the latest locations of all already-connected peers to the newcomer.
			for _, locMsg := range h.cache[client.GroupID] {
				msgBytes, err := json.Marshal(locMsg)
				if err != nil {
					log.Printf("error marshaling cached msg: %v", err)
					continue
				}
				// Attempt to push to their send buffer without blocking the whole thread.
				select {
				case client.send <- msgBytes:
				default:
					close(client.send)
					delete(h.groups[client.GroupID], client)
				}
			}

		case client := <-h.unregister:
			// A Client disconnected (e.g. closed browser)
			if group, ok := h.groups[client.GroupID]; ok {
				if _, ok := group[client]; ok {
					// Sever them from the tracking maps
					delete(group, client)
					close(client.send) // Cleanly closes their output pipeline
					
					// Delete from cache so new users don't see them
					if cacheGroup, cacheOk := h.cache[client.GroupID]; cacheOk {
						delete(cacheGroup, client.UserID)
					}
					
					// Broadcast disconnect to remaining peers
					disconnectMsg := LocationMessage{
						UserID:  client.UserID,
						GroupID: client.GroupID,
						Offline: true,
					}
					if msgBytes, err := json.Marshal(disconnectMsg); err == nil {
						for c := range group {
							select {
							case c.send <- msgBytes:
							default:
							}
						}
					}

					// If the room is permanently empty, nuke it entirely to save RAM allocation
					if len(group) == 0 {
						delete(h.groups, client.GroupID)
						delete(h.cache, client.GroupID)
					}
				}
			}

		case message := <-h.broadcast:
			// Someone in the group broadcasted a new GPS location
			var loc LocationMessage
			// Parse the raw JSON payload quickly so we can grab their exact location
			if err := json.Unmarshal(message.Payload, &loc); err == nil {
				// Store/Overwrite this user's current spot into the ongoing group cache log
				if _, ok := h.cache[loc.GroupID]; !ok {
					h.cache[loc.GroupID] = make(map[string]LocationMessage)
				}
				h.cache[loc.GroupID][loc.UserID] = loc
			} else {
				log.Printf("error unmarshaling broadcast msg: %v", err)
			}

			// Broadcast looping algorithm
			// Target every physical client in this user's room...
			if group, ok := h.groups[message.Sender.GroupID]; ok {
				for client := range group {
					// ...but logically skip bouncing the payload right back to the sender
					if client != message.Sender {
						select {
						// Shove it down their socket immediately
						case client.send <- message.Payload:
						default:
							// The client's buffer is jammed (connection dead), forcibly severe from Hub.
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
