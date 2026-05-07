package middleware

import (
	"context"
	"net/http"

	"location-sharing-backend/internal/auth"
	"location-sharing-backend/pkg/apierr"
)

type contextKey string

const UserIDKey contextKey = "userID"

// Auth returns middleware that validates JWT tokens.
// It checks the 'Authorization' header and the 'token' query parameter.
func Auth(tm *auth.TokenManager) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			tokenString := r.Header.Get("Authorization")

			// Fallback to query parameter for WebSockets (which don't easily support headers)
			if tokenString == "" {
				tokenString = r.URL.Query().Get("token")
			}

			if tokenString == "" {
				apierr.Render(w, http.StatusUnauthorized, "MISSING_TOKEN", "Authentication token is required")
				return
			}

			userID, err := tm.Verify(tokenString)
			if err != nil {
				apierr.Render(w, http.StatusUnauthorized, "INVALID_TOKEN", "Your session has expired or is invalid")
				return
			}

			// Inject the verified identity into the request context
			ctx := context.WithValue(r.Context(), UserIDKey, userID)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// GetUserID retrieves the userID from the request context.
func GetUserID(ctx context.Context) (string, bool) {
	userID, ok := ctx.Value(UserIDKey).(string)
	return userID, ok
}
