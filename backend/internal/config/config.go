package config

import (
	"log/slog"
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

	DBHost                string
	DBPort                string
	DBUser                string
	DBPassword            string
	DBName                string
	DBSSLMode             string
	LocationRetentionDays int

	OSRMBaseURL       string
	NominatimBaseURL  string
	RoutingCacheTTL   int // minutes
	GeocodingCacheTTL int // minutes

	UploadDir     string
	MaxUploadSize int // in bytes
}

// Load reads configuration from environment variables with sensible defaults.
func Load() *Config {
	origins := envOrDefault("ALLOWED_ORIGINS", "http://localhost:5173")
	c := &Config{
		Port:           envOrDefault("PORT", "8080"),
		Env:            envOrDefault("ENV", envOrDefault("APP_ENV", "development")),
		AllowedOrigins: strings.Split(origins, ","),
		MaxGroupSize:   envOrDefaultInt("MAX_GROUP_SIZE", 64),
		MaxMsgRate:     envOrDefaultInt("MAX_MSG_RATE", 10),
		JWTSecret:      envOrDefault("JWT_SECRET", ""),

		DBHost:                envOrDefault("DB_HOST", "localhost"),
		DBPort:                envOrDefault("DB_PORT", "5432"),
		DBUser:                envOrDefault("DB_USER", "app"),
		DBPassword:            envOrDefault("DB_PASSWORD", "app123"),
		DBName:                envOrDefault("DB_NAME", "location_share"),
		DBSSLMode:             envOrDefault("DB_SSLMODE", "disable"),
		LocationRetentionDays: envOrDefaultInt("LOCATION_RETENTION_DAYS", 7),

		OSRMBaseURL:       envOrDefault("OSRM_BASE_URL", "https://router.project-osrm.org"),
		NominatimBaseURL:  envOrDefault("NOMINATIM_BASE_URL", "https://nominatim.openstreetmap.org"),
		RoutingCacheTTL:   envOrDefaultInt("ROUTING_CACHE_TTL", 1440),
		GeocodingCacheTTL: envOrDefaultInt("GEOCODING_CACHE_TTL", 60),

		UploadDir:     envOrDefault("UPLOAD_DIR", "./uploads"),
		MaxUploadSize: envOrDefaultInt("MAX_UPLOAD_SIZE", 5242880), // 5MB default
	}

	// Clean origins
	for i, o := range c.AllowedOrigins {
		c.AllowedOrigins[i] = strings.TrimSpace(o)
	}

	c.validate()
	return c
}

func (c *Config) DBConnString() string {
	return "postgres://" + c.DBUser + ":" + c.DBPassword + "@" + c.DBHost + ":" + c.DBPort + "/" + c.DBName + "?sslmode=" + c.DBSSLMode
}

func (c *Config) validate() {
	const insecureDefault = "super-secret-key-change-me-in-production"

	if c.JWTSecret == "" || c.JWTSecret == insecureDefault {
		if c.Env == "production" {
			slog.Error("FATAL: JWT_SECRET is empty or uses the insecure default. Set a strong JWT_SECRET environment variable.")
			os.Exit(1)
		}
		if c.JWTSecret == "" {
			c.JWTSecret = insecureDefault
		}
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
