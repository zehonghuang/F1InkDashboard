package handlers

import (
	"toinc_f1_backend/internal/f1livetiming"
	"toinc_f1_backend/internal/ws"

	"github.com/gin-gonic/gin"
)

// @Summary MiniProgram F1 Live Timing WebSocket
// @Description 推送 GraphQL live timing manager 的实时快照，供小程序页面使用。
// @Tags MiniProgram
// @Router /ws/mp/f1/live-timing [get]
func WsMpF1LiveTiming(manager *f1livetiming.Manager, hub *ws.Hub) gin.HandlerFunc {
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
			"source": "f1_live_timing",
			"status": snapshot,
		})

		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				return
			}
		}
	}
}
