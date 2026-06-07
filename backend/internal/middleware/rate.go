package middleware

import (
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"golang.org/x/time/rate"
	"location-sharing-backend/pkg/apierr"
)

// limiterEntry pairs a rate limiter with its last-access timestamp.
type limiterEntry struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

// IPRateLimiter tracks rate limiters for individual IP addresses.
type IPRateLimiter struct {
	ips    map[string]*limiterEntry
	mu     *sync.RWMutex
	r      rate.Limit
	b      int
	stopCh chan struct{}
}

// NewIPRateLimiter creates a new IP-based rate limiter.
// r: limit in events per second. b: burst size.
// Call Stop() when shutting down to release the sweep goroutine.
func NewIPRateLimiter(r rate.Limit, b int) *IPRateLimiter {
	l := &IPRateLimiter{
		ips:    make(map[string]*limiterEntry),
		mu:     &sync.RWMutex{},
		r:      r,
		b:      b,
		stopCh: make(chan struct{}),
	}
	go l.sweepLoop()
	return l
}

// Stop terminates the background sweep goroutine.
func (i *IPRateLimiter) Stop() {
	close(i.stopCh)
}

// sweepLoop runs every 10 minutes and removes entries not seen in 30 minutes.
func (i *IPRateLimiter) sweepLoop() {
	ticker := time.NewTicker(10 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-i.stopCh:
			return
		case <-ticker.C:
			i.sweep(30 * time.Minute)
		}
	}
}

func (i *IPRateLimiter) sweep(maxAge time.Duration) {
	cutoff := time.Now().Add(-maxAge)
	i.mu.Lock()
	defer i.mu.Unlock()
	for ip, entry := range i.ips {
		if entry.lastSeen.Before(cutoff) {
			delete(i.ips, ip)
		}
	}
}

// GetLimiter returns the rate limiter for the provided IP address.
func (i *IPRateLimiter) GetLimiter(ip string) *rate.Limiter {
	i.mu.RLock()
	entry, exists := i.ips[ip]
	i.mu.RUnlock()

	if exists {
		i.mu.Lock()
		entry.lastSeen = time.Now()
		i.mu.Unlock()
		return entry.limiter
	}

	i.mu.Lock()
	defer i.mu.Unlock()
	// Double check after acquiring write lock
	if entry, exists = i.ips[ip]; exists {
		entry.lastSeen = time.Now()
		return entry.limiter
	}
	entry = &limiterEntry{
		limiter:  rate.NewLimiter(i.r, i.b),
		lastSeen: time.Now(),
	}
	i.ips[ip] = entry
	return entry.limiter
}

// RateLimit returns a middleware that limits requests by IP.
func RateLimit(limiter *IPRateLimiter) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip := clientIP(r)
			if !limiter.GetLimiter(ip).Allow() {
				apierr.Render(w, http.StatusTooManyRequests, "TOO_MANY_REQUESTS", "Please wait before making more requests")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// clientIP extracts the real client IP from proxy headers or RemoteAddr.
func clientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		// X-Forwarded-For may contain a chain: "client, proxy1, proxy2".
		// The first IP is the original client.
		if idx := strings.IndexByte(xff, ','); idx > 0 {
			return strings.TrimSpace(xff[:idx])
		}
		return strings.TrimSpace(xff)
	}
	if xri := r.Header.Get("X-Real-IP"); xri != "" {
		return strings.TrimSpace(xri)
	}
	// Strip port from RemoteAddr (e.g. "192.168.1.1:12345" -> "192.168.1.1")
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
