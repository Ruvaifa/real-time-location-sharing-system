package model

// ChatMessage is a durable message sent within a room.
type ChatMessage struct {
	MessageID       string `json:"messageID"`
	ClientMessageID string `json:"clientMessageId,omitempty"`
	GroupID         string `json:"groupID"`
	UserID          string `json:"userID"`
	Username        string `json:"username"`
	Text            string `json:"text"`
	Kind            string `json:"kind"`
	Timestamp       int64  `json:"timestamp"`
}

const (
	ChatKindText   = "text"
	ChatKindSystem = "system"
)
