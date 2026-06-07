package middleware

import (
	"net/http"
	"net/url"
	"strings"
	"time"

	chimw "github.com/go-chi/chi/v5/middleware"
)

// SanitizedLogFormatter wraps chi's DefaultLogFormatter so that sensitive
// query parameters (e.g. "token") are masked in the log output without
// mutating the original request.
type SanitizedLogFormatter struct {
	Inner  chimw.LogFormatter
	Redact []string
}

func (f *SanitizedLogFormatter) NewLogEntry(r *http.Request) chimw.LogEntry {
	needsSanitize := false
	for _, p := range f.Redact {
		if strings.Contains(r.RequestURI, p+"=") {
			needsSanitize = true
			break
		}
	}

	if !needsSanitize {
		return f.Inner.NewLogEntry(r)
	}

	// Shallow copy — only the URL is changed; the original request is untouched.
	sanitizedURI := r.RequestURI
	if parsed, err := url.ParseRequestURI(r.RequestURI); err == nil {
		q := parsed.Query()
		dirty := false
		for _, p := range f.Redact {
			if q.Has(p) {
				q.Set(p, "***")
				dirty = true
			}
		}
		if dirty {
			parsed.RawQuery = q.Encode()
			sanitizedURI = parsed.String()
		}
	}

	clone := *r
	clone.RequestURI = sanitizedURI
	return f.Inner.NewLogEntry(&clone)
}

// LoggerWithFormatter returns a chi-compatible logging middleware that uses
// the given LogFormatter. Drop-in replacement for chimw.Logger.
func LoggerWithFormatter(formatter chimw.LogFormatter) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		fn := func(w http.ResponseWriter, r *http.Request) {
			entry := formatter.NewLogEntry(r)
			ww := chimw.NewWrapResponseWriter(w, r.ProtoMajor)

			t1 := time.Now()
			defer func() {
				entry.Write(ww.Status(), ww.BytesWritten(), ww.Header(), time.Since(t1), nil)
			}()

			next.ServeHTTP(ww, r)
		}
		return http.HandlerFunc(fn)
	}
}
