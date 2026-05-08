package handlers

import (
	"time"

	"toinc_f1_backend/internal/ws"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

func WsEcho(hub *ws.Hub) gin.HandlerFunc {
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

		_ = conn.WriteMessage(websocket.TextMessage, []byte("HELLO"))

		conn.SetReadLimit(512)
		_ = conn.SetReadDeadline(time.Now().Add(5 * time.Minute))
		conn.SetPongHandler(func(string) error {
			_ = conn.SetReadDeadline(time.Now().Add(5 * time.Minute))
			return nil
		})

		for {
			mt, msg, err := conn.ReadMessage()
			if err != nil {
				return
			}
			if mt != websocket.TextMessage {
				continue
			}
			_ = conn.WriteMessage(websocket.TextMessage, msg)
		}
	}
}
