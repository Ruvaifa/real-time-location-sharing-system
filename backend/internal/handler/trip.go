package handler

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"

	"location-sharing-backend/pkg/apierr"
)

// GetActiveTrip handles GET /api/trip/{groupID} — returns the active trip for a group.
func (h *Handler) GetActiveTrip(w http.ResponseWriter, r *http.Request) {
	groupID := chi.URLParam(r, "groupID")
	if groupID == "" {
		apierr.Render(w, http.StatusBadRequest, "MISSING_GROUP_ID", "groupID is required")
		return
	}

	trip, err := h.hub.GetActiveTrip(groupID)
	if err != nil {
		log.Printf("get active trip error: %v", err)
		apierr.Render(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Could not fetch trip")
		return
	}

	if trip == nil {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte("null"))
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(trip)
}
