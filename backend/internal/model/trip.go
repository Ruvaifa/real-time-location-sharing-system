package model

// Trip represents a shared trip between group members.
type Trip struct {
	ID              string   `json:"id"`
	GroupID         string   `json:"groupID"`
	CreatorID       string   `json:"creatorID"`
	CreatorName     string   `json:"creatorName"`
	OriginLat       float64  `json:"originLat"`
	OriginLng       float64  `json:"originLng"`
	OriginName      string   `json:"originName"`
	DestLat         float64  `json:"destLat"`
	DestLng         float64  `json:"destLng"`
	DestName        string   `json:"destName"`
	RouteGeometry   string   `json:"routeGeometry"`
	DistanceMeters  float64  `json:"distanceMeters"`
	DurationSeconds float64  `json:"durationSeconds"`
	Status          string   `json:"status"`
	Participants    []string `json:"participants"`
	StartedAt       *int64   `json:"startedAt,omitempty"`
	EndedAt         *int64   `json:"endedAt,omitempty"`
	CreatedAt       int64    `json:"createdAt"`
}

const (
	TripStatusPlanning  = "planning"
	TripStatusActive    = "active"
	TripStatusCompleted = "completed"
)
