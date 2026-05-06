package apierr

import (
	"encoding/json"
	"net/http"
)

type errorBody struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type envelope struct {
	Error errorBody `json:"error"`
}

// Render writes a structured JSON error response.
func Render(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(envelope{
		Error: errorBody{Code: code, Message: message},
	})
}
