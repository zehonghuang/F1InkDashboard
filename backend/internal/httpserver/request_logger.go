package httpserver

import (
	"log"
	"net/url"
	"sort"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

func RequestLogger(enabled bool) gin.HandlerFunc {
	if !enabled {
		return func(c *gin.Context) { c.Next() }
	}
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()

		lat := time.Since(start)
		st := c.Writer.Status()
		sz := c.Writer.Size()

		path := c.Request.URL.Path
		q := sanitizeQuery(c.Request.URL.RawQuery)
		if q != "" {
			path = path + "?" + q
		}

		log.Printf("http %s %s -> %d %dB %s ip=%s ua=%q", c.Request.Method, path, st, sz, lat.Truncate(time.Millisecond), c.ClientIP(), c.Request.UserAgent())
	}
}

func sanitizeQuery(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	v, err := url.ParseQuery(raw)
	if err != nil {
		return ""
	}
	redactKeys := map[string]struct{}{
		"token":                {},
		"ingest_token":         {},
		"news_ingest_token":    {},
		"openf1_ingest_token":  {},
		"password":             {},
		"mysql_password":       {},
		"authorization":        {},
		"x-api-key":            {},
	}
	keys := make([]string, 0, len(v))
	for k := range v {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	out := make(url.Values, len(v))
	for _, k := range keys {
		kl := strings.ToLower(strings.TrimSpace(k))
		if _, ok := redactKeys[kl]; ok {
			out.Set(k, "REDACTED")
			continue
		}
		out[k] = v[k]
	}
	return out.Encode()
}

