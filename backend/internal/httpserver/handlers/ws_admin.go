package handlers

import (
	"strings"

	"toinc_f1_backend/internal/ws"

	"github.com/gin-gonic/gin"
)

func WsStatus(hub *ws.Hub) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.JSON(200, gin.H{"ok": true, "clients": hub.Count()})
	}
}

func WsBroadcast(hub *ws.Hub) gin.HandlerFunc {
	return func(c *gin.Context) {
		text := strings.TrimSpace(c.Query("text"))
		if len(text) == 0 || len(text) > 512 {
			c.JSON(400, gin.H{"ok": false, "error": "bad_text"})
			return
		}
		sent := hub.BroadcastText(text)
		c.JSON(200, gin.H{"ok": true, "sent": sent})
	}
}
