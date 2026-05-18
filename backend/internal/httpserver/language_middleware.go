package httpserver

import (
	"strings"

	"github.com/gin-gonic/gin"
)

const ContextKeyLanguage = "language"

func LanguageMiddleware(defaultLanguage string) gin.HandlerFunc {
	if strings.TrimSpace(defaultLanguage) == "" {
		defaultLanguage = "en-US"
	}
	return func(c *gin.Context) {
		lang := ParseAcceptLanguage(c.GetHeader("Accept-Language"))
		if lang == "" {
			lang = defaultLanguage
		}
		c.Set(ContextKeyLanguage, lang)
		c.Header("Content-Language", lang)
		c.Next()
	}
}

func ParseAcceptLanguage(v string) string {
	v = strings.TrimSpace(v)
	if v == "" {
		return ""
	}
	if i := strings.IndexByte(v, ','); i >= 0 {
		v = v[:i]
	}
	if i := strings.IndexByte(v, ';'); i >= 0 {
		v = v[:i]
	}
	v = strings.TrimSpace(v)
	v = strings.ReplaceAll(v, "_", "-")
	if v == "" {
		return ""
	}
	parts := strings.Split(v, "-")
	if len(parts) == 1 {
		return strings.ToLower(parts[0])
	}
	lang := strings.ToLower(parts[0])
	region := strings.ToUpper(parts[1])
	return lang + "-" + region
}
