package validate

import (
	"errors"

	"location-sharing-backend/internal/model"
)

const (
	maxNameLen        = 256
	maxRouteGeometry  = 500_000 // ~500KB of encoded geometry
)

// TripCreate validates a trip creation message.
func TripCreate(trip *model.Trip) error {
	if trip.ID == "" {
		return errors.New("id is required")
	}
	if len(trip.ID) > 128 {
		return errors.New("id exceeds max length")
	}
	if trip.DestLat < -90 || trip.DestLat > 90 {
		return errors.New("dest_lat out of range")
	}
	if trip.DestLng < -180 || trip.DestLng > 180 {
		return errors.New("dest_lng out of range")
	}
	if trip.OriginLat < -90 || trip.OriginLat > 90 {
		return errors.New("origin_lat out of range")
	}
	if trip.OriginLng < -180 || trip.OriginLng > 180 {
		return errors.New("origin_lng out of range")
	}
	if trip.RouteGeometry == "" {
		return errors.New("route_geometry is required")
	}
	if len(trip.RouteGeometry) > maxRouteGeometry {
		return errors.New("route_geometry exceeds max size")
	}
	if len(trip.DestName) > maxNameLen {
		return errors.New("dest_name exceeds max length")
	}
	if len(trip.OriginName) > maxNameLen {
		return errors.New("origin_name exceeds max length")
	}
	if len(trip.CreatorName) > maxNameLen {
		return errors.New("creator_name exceeds max length")
	}
	return nil
}
