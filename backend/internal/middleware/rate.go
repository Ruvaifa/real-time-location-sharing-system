package middleware

import (
	"net/http"
	"sync"

	"golang.org/x/time/rate"
	"location-sharing-backend/pkg/apierr"
)

// IPRateLimiter tracks rate limiters for individual IP addresses.
type IPRateLimiter struct {
	ips map[string]*rate.Limiter
	mu  *sync.RWMutex
	r   rate.Limit
	b   int
}

// NewIPRateLimiter creates a new IP-based rate limiter.
// r: limit in events per second.
// b: burst size.
func NewIPRateLimiter(r rate.Limit, b int) *IPRateLimiter {
	return &IPRateLimiter{
		ips: make(map[string]*rate.Limiter),
		mu:  &sync.RWMutex{},
		r:   r,
		b:   b,
	}
}

// GetLimiter returns the rate limiter for the provided IP address.
func (i *IPRateLimiter) GetLimiter(ip string) *rate.Limiter {
	i.mu.RLock()
	limiter, exists := i.ips[ip]
	i.mu.RUnlock()

	if !exists {
		i.mu.Lock()
		defer i.mu.Unlock()
		// Double check after acquiring write lock
		if limiter, exists = i.ips[ip]; exists {
			return limiter
		}
		limiter = rate.NewLimiter(i.r, i.b)
		i.ips[ip] = limiter
	}

	return limiter
}

// RateLimit returns a middleware that limits requests by IP.
func RateLimit(limiter *IPRateLimiter) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// In production, you might want to use X-Forwarded-For if behind a proxy
			ip := r.RemoteAddr
			if !limiter.GetLimiter(ip).Allow() {
				apierr.Render(w, http.StatusTooManyRequests, "TOO_MANY_REQUESTS", "Please wait before making more requests")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
