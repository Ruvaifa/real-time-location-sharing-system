package routing

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"time"

	"location-sharing-backend/internal/services/cache"
)

type osrmGeoJSONResponse struct {
	Code   string `json:"code"`
	Routes []struct {
		Geometry struct {
			Type        string      `json:"type"`
			Coordinates [][]float64 `json:"coordinates"`
		} `json:"geometry"`
		Distance float64 `json:"distance"`
		Duration float64 `json:"duration"`
	} `json:"routes"`
}

// OSRMRouter implements Router using the public OSRM demo server.
type OSRMRouter struct {
	baseURL string
	client  *http.Client
	cache   *cache.Cache[*RouteResult]
}

// NewOSRMRouter creates an OSRM-backed Router with caching.
func NewOSRMRouter(baseURL string, c *cache.Cache[*RouteResult]) *OSRMRouter {
	return &OSRMRouter{
		baseURL: baseURL,
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
		cache: c,
	}
}

func (r *OSRMRouter) GetRoute(ctx context.Context, req RouteRequest) (*RouteResult, error) {
	key := CacheKey(req)
	if cached, ok := r.cache.Get(key); ok {
		return cached, nil
	}

	url := fmt.Sprintf(
		"%s/route/v1/cycling/%f,%f;%f,%f?overview=full&geometries=geojson&steps=false",
		r.baseURL,
		req.OriginLng, req.OriginLat,
		req.DestLng, req.DestLat,
	)

	slog.Debug("OSRM route request",
		"origin_lat", req.OriginLat, "origin_lng", req.OriginLng,
		"dest_lat", req.DestLat, "dest_lng", req.DestLng,
	)

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	resp, err := r.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("osrm request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("osrm returned %d: %s", resp.StatusCode, string(body))
	}

	var osrmResp osrmGeoJSONResponse
	if err := json.Unmarshal(body, &osrmResp); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}

	if osrmResp.Code != "Ok" || len(osrmResp.Routes) == 0 {
		return nil, fmt.Errorf("osrm no route found: %s", osrmResp.Code)
	}

	route := osrmResp.Routes[0]

	// GeoJSON coordinates are [lng, lat]. Convert to [lat, lng] for Leaflet.
	coords := make([][2]float64, len(route.Geometry.Coordinates))
	for i, c := range route.Geometry.Coordinates {
		coords[i] = [2]float64{c[1], c[0]} // swap lng,lat → lat,lng
	}

	// Build a simple encoded-ish geometry string for the polyline fallback.
	// Not used for rendering, but kept in the struct.
	geometry := fmt.Sprintf("geojson:%dpts", len(coords))

	slog.Debug("OSRM route computed",
		"points", len(coords),
		"distance_m", route.Distance,
		"duration_s", route.Duration,
	)

	result := &RouteResult{
		Geometry:    geometry,
		Coordinates: coords,
		DistanceM:   route.Distance,
		DurationSec: route.Duration,
	}

	r.cache.Set(key, result)
	return result, nil
}
