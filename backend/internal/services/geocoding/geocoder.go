package geocoding

import "context"

// SearchResult represents a geocoding hit.
type SearchResult struct {
	Name        string  `json:"name"`
	DisplayName string  `json:"displayName"`
	Lat         float64 `json:"lat"`
	Lng         float64 `json:"lng"`
}

// Geocoder converts place-name queries into geographic coordinates.
type Geocoder interface {
	Search(ctx context.Context, query string) ([]SearchResult, error)
}
