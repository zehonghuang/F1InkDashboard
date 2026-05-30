package handlers

import (
	"strings"

	"toinc_f1_backend/internal/ws"

	"github.com/gin-gonic/gin"
)

// @Summary WebSocket 在线状态
// @Description 返回当前 hub 的在线客户端数量。
// @Tags WebSocket
// @Produce json
// @Success 200 {object} WsStatusResponse
// @Router /api/v1/ws/status [get]
func WsStatus(hub *ws.Hub) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.JSON(200, gin.H{"ok": true, "clients": hub.Count()})
	}
}

// @Summary 广播消息到所有 WebSocket 客户端
// @Description text 长度必须为 1-512 字符。
// @Tags WebSocket
// @Produce json
// @Param text query string true "要广播的文本内容（1-512 字符）"
// @Success 200 {object} WsBroadcastResponse
// @Failure 400 {object} ErrorResponse
// @Router /api/v1/ws/broadcast [get]
// @Router /api/v1/ws/broadcast [post]
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
