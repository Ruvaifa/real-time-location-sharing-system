package model

// LocationMessage represents a user's location update or offline status.
type LocationMessage struct {
	UserID    string  `json:"userID"`
	GroupID   string  `json:"groupID"`
	Lat       float64 `json:"lat"`
	Lng       float64 `json:"lng"`
	Name      string  `json:"name"`
	Timestamp int64   `json:"timestamp"`
	Offline   bool    `json:"offline,omitempty"`
}
