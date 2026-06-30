package handlers

import (
	"toinc_f1_backend/internal/config"
	"toinc_f1_backend/internal/f1livetiming"
	"toinc_f1_backend/internal/ws"

	"github.com/gin-gonic/gin"
)

// @Summary F1 Live Timing WebSocket
// @Description 推送 GraphQL live timing manager 的实时快照。
// @Tags Admin
// @Router /ws/f1/live-timing [get]
func WsF1LiveTiming(cfg config.Config, manager *f1livetiming.Manager, hub *ws.Hub) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !adminTokenOK(c, cfg.AdminToken) {
			return
		}

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
