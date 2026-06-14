package handlers

import (
	"toinc_f1_backend/internal/motorsportlive"
	"toinc_f1_backend/internal/ws"

	"github.com/gin-gonic/gin"
)

// @Summary Motorsport Live WebSocket
// @Description 推送后端已解析缓存的 Motorsport live standings。
// @Tags MiniProgram
// @Router /ws/motorsport/live [get]
func WsMotorsportLive(manager *motorsportlive.Manager, hub *ws.Hub) gin.HandlerFunc {
	return func(c *gin.Context) {
		conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			return
		}
		hub.Add(conn)
		defer func() {
			hub.Remove(conn)
			_ = conn.Close()
		}()

		snapshot := manager.Snapshot()
		_ = conn.WriteJSON(gin.H{
			"type":   "hello",
			"source": "motorsport_live",
			"status": snapshot,
		})

		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				return
			}
		}
	}
}
