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
}

// Load reads configuration from environment variables with sensible defaults.
func Load() *Config {
	origins := envOrDefault("ALLOWED_ORIGINS", "http://localhost:5173")
	var parsed []string
	for _, o := range strings.Split(origins, ",") {
		o = strings.TrimSpace(o)
		if o != "" {
			parsed = append(parsed, o)
		}
	}

	return &Config{
		Port:           envOrDefault("PORT", "8080"),
		Env:            envOrDefault("APP_ENV", "development"),
		AllowedOrigins: parsed,
		MaxGroupSize:   envOrDefaultInt("MAX_GROUP_SIZE", 64),
		MaxMsgRate:     envOrDefaultInt("MAX_MSG_RATE", 10),
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
