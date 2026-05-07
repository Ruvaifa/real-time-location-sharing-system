package middleware

import (
	"context"
	"net/http"
	"strings"

	"location-sharing-backend/internal/auth"
	"location-sharing-backend/pkg/apierr"
)

type contextKey string

const UserIDKey contextKey = "userID"

// Auth returns a middleware that validates JWTs from the Authorization header or "token" query param.
func Auth(tm *auth.TokenManager) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			var tokenString string

			// 1. Try to get token from Authorization header
			authHeader := r.Header.Get("Authorization")
			if strings.HasPrefix(authHeader, "Bearer ") {
				tokenString = strings.TrimPrefix(authHeader, "Bearer ")
			}

			// 2. Fallback to "token" query parameter (common for WebSockets)
			if tokenString == "" {
				tokenString = r.URL.Query().Get("token")
			}

			if tokenString == "" {
				apierr.Render(w, http.StatusUnauthorized, "UNAUTHORIZED", "Missing authentication token")
				return
			}

			// 3. Verify the token
			claims, err := tm.Verify(tokenString)
			if err != nil {
				apierr.Render(w, http.StatusUnauthorized, "INVALID_TOKEN", "Invalid or expired token")
				return
			}

			// 4. Inject userID into the request context
			ctx := context.WithValue(r.Context(), UserIDKey, claims.UserID)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// GetUserID extracts the userID from a request context.
func GetUserID(ctx context.Context) (string, bool) {
	userID, ok := ctx.Value(UserIDKey).(string)
	return userID, ok
}
