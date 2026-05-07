package handlers

import "github.com/gin-gonic/gin"

func RegisterCompatPlaceholders(r *gin.Engine) {
	notImpl := func(c *gin.Context) {
		c.JSON(501, gin.H{"ok": false, "error": "not_implemented"})
	}

	r.GET("/api/v1/news/breaking", notImpl)

	r.POST("/api/v1/device/ws/send", notImpl)
}
