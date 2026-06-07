package geocoding

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"location-sharing-backend/pkg/apierr"
)

// Handler exposes geocoding as HTTP endpoints.
type Handler struct {
	geocoder Geocoder
}

// NewHandler creates a geocoding HTTP handler.
func NewHandler(geocoder Geocoder) *Handler {
	return &Handler{geocoder: geocoder}
}

// Search handles GET /api/search?q=...
func (h *Handler) Search(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query().Get("q")
	if query == "" {
		apierr.Render(w, http.StatusBadRequest, "MISSING_QUERY", "q query parameter is required")
		return
	}

	slog.Debug("Geocoding search", "query", query)
	results, err := h.geocoder.Search(r.Context(), query)
	if err != nil {
		slog.Error("Geocoding search failed", "query", query, "error", err)
		apierr.Render(w, http.StatusBadGateway, "GEOCODING_ERROR", "Could not search places")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(results)
}
