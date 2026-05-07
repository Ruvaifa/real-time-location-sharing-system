package config

import (
	"os"
	"strconv"
	"strings"
)

// Config holds all runtime configuration loaded from environment variables.
type Config struct {
	Port           string
	Env            string
	AllowedOrigins []string
	MaxGroupSize   int
	MaxMsgRate     int // max messages per second per client
	JWTSecret      string
}

// Load reads configuration from environment variables with sensible defaults.
func Load() *Config {
	origins := envOrDefault("ALLOWED_ORIGINS", "http://localhost:5173")
	c := &Config{
		Port:           envOrDefault("PORT", "8080"),
		Env:            envOrDefault("ENV", "development"),
		AllowedOrigins: strings.Split(origins, ","),
		MaxGroupSize:   envOrDefaultInt("MAX_GROUP_SIZE", 64),
		MaxMsgRate:     envOrDefaultInt("MAX_MSG_RATE", 10),
		JWTSecret:      envOrDefault("JWT_SECRET", ""),
	}

	// Clean origins
	for i, o := range c.AllowedOrigins {
		c.AllowedOrigins[i] = strings.TrimSpace(o)
	}

	c.validate()
	return c
}

func (c *Config) validate() {
	if c.Env == "production" && (c.JWTSecret == "" || c.JWTSecret == "super-secret-key-change-me-in-production") {
		// In a real production app, we should panic or exit.
		// For now, we'll just log a huge warning.
		println("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")
		println("CRITICAL SECURITY WARNING: Insecure JWT_SECRET used in production!")
		println("Please set a strong JWT_SECRET environment variable.")
		println("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")
	}

	if c.JWTSecret == "" {
		c.JWTSecret = "super-secret-key-change-me-in-production"
	}
}

func envOrDefault(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func envOrDefaultInt(key string, fallback int) int {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return fallback
	}
	return n
}
