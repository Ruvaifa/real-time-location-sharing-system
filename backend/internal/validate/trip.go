package validate

import (
	"errors"

	"location-sharing-backend/internal/model"
)

// TripCreate validates a trip creation message.
func TripCreate(trip *model.Trip) error {
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
	if len(trip.DestName) > 256 {
		return errors.New("dest_name exceeds max length")
	}
	return nil
}
