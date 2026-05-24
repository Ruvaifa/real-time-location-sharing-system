package routing

import "context"

// RouteRequest describes an origin-destination pair for routing.
type RouteRequest struct {
	OriginLat float64
	OriginLng float64
	DestLat   float64
	DestLng   float64
}

// RouteResult holds the computed route from a routing service.
type RouteResult struct {
	Geometry    string       `json:"geometry"`    // encoded polyline
	Coordinates [][2]float64 `json:"coordinates"` // decoded lat/lng pairs
	DistanceM   float64      `json:"distance"`    // meters
	DurationSec float64      `json:"duration"`    // seconds
}

// Router computes routes between two geographic points.
type Router interface {
	GetRoute(ctx context.Context, req RouteRequest) (*RouteResult, error)
}
