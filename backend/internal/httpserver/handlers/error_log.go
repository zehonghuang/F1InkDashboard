package handlers

import (
	"log"
	"strings"

	"github.com/gin-gonic/gin"
)

func LogReqError(c *gin.Context, handler string, errorKey string, err error) {
	lang := strings.TrimSpace(c.GetString("language"))
	path := ""
	if c.Request != nil && c.Request.URL != nil {
		path = c.Request.URL.String()
	}
	if err != nil {
		log.Printf("handler_error handler=%s error=%s err=%v ip=%s ua=%q path=%s lang=%s", handler, errorKey, err, c.ClientIP(), c.Request.UserAgent(), path, lang)
		return
	}
	log.Printf("handler_error handler=%s error=%s ip=%s ua=%q path=%s lang=%s", handler, errorKey, c.ClientIP(), c.Request.UserAgent(), path, lang)
}
