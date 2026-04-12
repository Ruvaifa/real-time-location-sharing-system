package validate

import (
	"errors"
	"math"

	"location-sharing-backend/internal/model"
)

const maxNameLength = 64

// Location checks that a LocationMessage has valid coordinates and a
// reasonably-sized display name.
func Location(loc model.LocationMessage) error {
	if math.IsNaN(loc.Lat) || math.IsInf(loc.Lat, 0) {
		return errors.New("lat is NaN or Inf")
	}
	if math.IsNaN(loc.Lng) || math.IsInf(loc.Lng, 0) {
		return errors.New("lng is NaN or Inf")
	}
	if loc.Lat < -90 || loc.Lat > 90 {
		return errors.New("lat out of range [-90, 90]")
	}
	if loc.Lng < -180 || loc.Lng > 180 {
		return errors.New("lng out of range [-180, 180]")
	}
	if len(loc.Name) > maxNameLength {
		return errors.New("name exceeds max length")
	}
	return nil
}
