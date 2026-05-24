package cache

import (
	"sync"
	"time"
)

type entry[V any] struct {
	value     V
	expiresAt time.Time
}

// Cache is a generic in-memory TTL cache with a max-entry cap.
type Cache[V any] struct {
	entries map[string]entry[V]
	mu      sync.RWMutex
	ttl     time.Duration
	maxSize int
}

// New creates a new Cache with the given TTL and max entries.
func New[V any](ttl time.Duration, maxSize int) *Cache[V] {
	return &Cache[V]{
		entries: make(map[string]entry[V]),
		ttl:     ttl,
		maxSize: maxSize,
	}
}

// Get retrieves a value by key. Returns zero value and false if missing or expired.
func (c *Cache[V]) Get(key string) (V, bool) {
	c.mu.RLock()
	e, ok := c.entries[key]
	c.mu.RUnlock()

	if !ok || time.Now().After(e.expiresAt) {
		var zero V
		return zero, false
	}
	return e.value, true
}

// Set stores a value with the configured TTL.
func (c *Cache[V]) Set(key string, value V) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if len(c.entries) >= c.maxSize {
		c.evictOldest()
	}

	c.entries[key] = entry[V]{
		value:     value,
		expiresAt: time.Now().Add(c.ttl),
	}
}

// evictOldest removes the entry with the earliest expiration time.
// Must be called with mu held.
func (c *Cache[V]) evictOldest() {
	var oldestKey string
	var oldestTime time.Time

	for k, v := range c.entries {
		if oldestKey == "" || v.expiresAt.Before(oldestTime) {
			oldestKey = k
			oldestTime = v.expiresAt
		}
	}

	if oldestKey != "" {
		delete(c.entries, oldestKey)
	}
}

// Len returns the number of entries in the cache (including expired ones not yet evicted).
func (c *Cache[V]) Len() int {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return len(c.entries)
}
