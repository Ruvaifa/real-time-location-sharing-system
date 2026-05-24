package geocoding

import "strings"

// CacheKey normalizes a search query for use as a cache key.
func CacheKey(query string) string {
	return strings.ToLower(strings.TrimSpace(query))
}
