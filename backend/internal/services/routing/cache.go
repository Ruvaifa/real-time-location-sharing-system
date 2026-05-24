package routing

import "fmt"

// CacheKey builds a deterministic cache key from a route request.
// Coordinates are rounded to 5 decimal places (~1m precision) to allow minor float drift.
func CacheKey(req RouteRequest) string {
	return fmt.Sprintf("%.5f,%.5f:%.5f,%.5f",
		req.OriginLat, req.OriginLng,
		req.DestLat, req.DestLng,
	)
}
