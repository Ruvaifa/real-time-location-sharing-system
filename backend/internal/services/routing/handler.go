package routing

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"location-sharing-backend/pkg/apierr"
)

// Handler exposes routing as HTTP endpoints.
type Handler struct {
	router Router
}

// NewHandler creates a routing HTTP handler.
func NewHandler(router Router) *Handler {
	return &Handler{router: router}
}

// GetRoute handles GET /api/route?origin=lat,lng&dest=lat,lng
func (h *Handler) GetRoute(w http.ResponseWriter, r *http.Request) {
	originStr := r.URL.Query().Get("origin")
	destStr := r.URL.Query().Get("dest")

	if originStr == "" || destStr == "" {
		apierr.Render(w, http.StatusBadRequest, "MISSING_PARAMS", "origin and dest query parameters are required (lat,lng)")
		return
	}

	origin, err := parseCoord(originStr)
	if err != nil {
		apierr.Render(w, http.StatusBadRequest, "INVALID_ORIGIN", "origin must be in lat,lng format")
		return
	}

	dest, err := parseCoord(destStr)
	if err != nil {
		apierr.Render(w, http.StatusBadRequest, "INVALID_DEST", "dest must be in lat,lng format")
		return
	}

	result, err := h.router.GetRoute(r.Context(), RouteRequest{
		OriginLat: origin[0],
		OriginLng: origin[1],
		DestLat:   dest[0],
		DestLng:   dest[1],
	})
	if err != nil {
		slog.Error("Routing failed", "origin", originStr, "dest", destStr, "error", err)
		apierr.Render(w, http.StatusBadGateway, "ROUTING_ERROR", "Could not compute route")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func parseCoord(s string) ([2]float64, error) {
	parts := strings.Split(s, ",")
	if len(parts) != 2 {
		return [2]float64{}, http.ErrMissingFile
	}

	lat, err := strconv.ParseFloat(parts[0], 64)
	if err != nil {
		return [2]float64{}, err
	}

	lng, err := strconv.ParseFloat(parts[1], 64)
	if err != nil {
		return [2]float64{}, err
	}

	return [2]float64{lat, lng}, nil
}
