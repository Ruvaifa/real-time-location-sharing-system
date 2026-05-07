package config

import (
	"os"
	"strconv"
	"strings"
)

type Config struct {
	Port           string
	Env            string
	AllowedOrigins []string
	MaxGroupSize   int
	MaxMsgRate     int
	JWTSecret      string
}

// Load fetches configuration from environment variables with sensible defaults.
func Load() *Config {
	origins := envOrDefault("ALLOWED_ORIGINS", "http://localhost:5173")
	
	return &Config{
		Port:           envOrDefault("PORT", "8080"),
		Env:            envOrDefault("ENV", "development"),
		AllowedOrigins: strings.Split(origins, ","),
		MaxGroupSize:   envIntOrDefault("MAX_GROUP_SIZE", 50),
		MaxMsgRate:     envIntOrDefault("MAX_MSG_RATE", 10),
		JWTSecret:      envOrDefault("JWT_SECRET", "super-secret-key-change-me-in-production"),
	}
}

func envOrDefault(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}

func envIntOrDefault(key string, fallback int) int {
	if value, ok := os.LookupEnv(key); ok {
		if i, err := strconv.Atoi(value); err == nil {
			return i
		}
	}
	return fallback
}
