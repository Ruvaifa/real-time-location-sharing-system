package geocoding

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"

	"location-sharing-backend/internal/services/cache"
)

type nominatimResult struct {
	DisplayName string `json:"display_name"`
	Lat         string `json:"lat"`
	Lon         string `json:"lon"`
	Name        string `json:"name"`
}

// NominatimGeocoder implements Geocoder using the Nominatim API.
type NominatimGeocoder struct {
	baseURL string
	client  *http.Client
	cache   *cache.Cache[[]SearchResult]
	mu      sync.Mutex
	lastReq time.Time
}

// NewNominatimGeocoder creates a Nominatim-backed Geocoder with caching.
// It enforces Nominatim's 1 req/s rate limit.
func NewNominatimGeocoder(baseURL string, c *cache.Cache[[]SearchResult]) *NominatimGeocoder {
	return &NominatimGeocoder{
		baseURL: baseURL,
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
		cache: c,
	}
}

func (g *NominatimGeocoder) Search(ctx context.Context, query string) ([]SearchResult, error) {
	key := CacheKey(query)
	if cached, ok := g.cache.Get(key); ok {
		return cached, nil
	}

	g.rateLimit()

	url := fmt.Sprintf(
		"%s/search?q=%s&format=json&limit=5&addressdetails=1",
		g.baseURL,
		query,
	)

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	httpReq.Header.Set("User-Agent", "ParkQLive/1.0")

	resp, err := g.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("nominatim request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("nominatim returned %d: %s", resp.StatusCode, string(body))
	}

	var raw []nominatimResult
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}

	results := make([]SearchResult, 0, len(raw))
	for _, r := range raw {
		var lat, lng float64
		fmt.Sscanf(r.Lat, "%f", &lat)
		fmt.Sscanf(r.Lon, "%f", &lng)
		results = append(results, SearchResult{
			Name:        r.Name,
			DisplayName: r.DisplayName,
			Lat:         lat,
			Lng:         lng,
		})
	}

	g.cache.Set(key, results)
	return results, nil
}

// rateLimit enforces Nominatim's 1 req/s usage policy.
func (g *NominatimGeocoder) rateLimit() {
	g.mu.Lock()
	defer g.mu.Unlock()

	elapsed := time.Since(g.lastReq)
	if elapsed < 1*time.Second {
		time.Sleep(1*time.Second - elapsed)
	}
	g.lastReq = time.Now()
}
