package main

// LocationMessage is the primary message type sent over the wire in both directions.
type LocationMessage struct {
	UserID    string  `json:"userID"`    // unique user identifier (UUID or name)
	GroupID   string  `json:"groupID"`   // shared group session ID
	Lat       float64 `json:"lat"`       // latitude (-90 to 90)
	Lng       float64 `json:"lng"`       // longitude (-180 to 180)
	Name      string  `json:"name"`      // display name shown on map marker
	Timestamp int64   `json:"timestamp"` // Unix milliseconds (time.Now().UnixMilli())
}

// ClientInfo is used by the Hub to track the last known state of a connected user.
type ClientInfo struct {
	Client   *Client
	LastSeen LocationMessage
}

// HubMessage wraps an outgoing message with its sender so the Hub can skip echoing back to the sender.
type HubMessage struct {
	Sender  *Client
	Payload []byte
}
