package model

import "encoding/json"

// Envelope wraps all WebSocket messages with a type discriminator.
type Envelope struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

const (
	MsgTypeLocation    = "location"
	MsgTypeTripCreate  = "trip_create"
	MsgTypeTripJoin    = "trip_join"
	MsgTypeTripLeave   = "trip_leave"
	MsgTypeTripStart   = "trip_start"
	MsgTypeTripEnd     = "trip_end"
	MsgTypeChatMessage = "chat_message"
	MsgTypeAlert       = "alert"
)
