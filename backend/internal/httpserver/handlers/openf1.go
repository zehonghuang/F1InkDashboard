package handlers

import (
	"encoding/json"
	"strings"

	"toinc_f1_backend/internal/config"
	"toinc_f1_backend/internal/ws"

	"github.com/gin-gonic/gin"
)

func OpenF1Status(cfg config.Config, hub *ws.Hub) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.JSON(200, gin.H{
			"enabled":   cfg.OpenF1Enabled,
			"mode":      cfg.OpenF1Mode,
			"running":   cfg.OpenF1Enabled,
			"connected": false,
			"clients": gin.H{
				"ws_fw":  hub.Count(),
				"ws_raw": hub.Count(),
			},
		})
	}
}

func WsOpenF1(cfg config.Config, hub *ws.Hub) gin.HandlerFunc {
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

		_ = conn.WriteJSON(gin.H{
			"type":   "hello",
			"source": "openf1",
			"status": gin.H{
				"enabled": cfg.OpenF1Enabled,
				"mode":    cfg.OpenF1Mode,
				"running": cfg.OpenF1Enabled,
				"clients": gin.H{
					"ws_fw":  hub.Count(),
					"ws_raw": hub.Count(),
				},
			},
		})

		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				return
			}
		}
	}
}

func OpenF1Ingest(cfg config.Config, hub *ws.Hub) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !checkToken(c, cfg.OpenF1IngestToken) {
			return
		}
		var body any
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(400, gin.H{"ok": false, "error": "bad_json"})
			return
		}
		msg := normalizeOpenF1Event(body)
		_ = hub.BroadcastJSON(msg)
		c.JSON(200, gin.H{"ok": true})
	}
}

func OpenF1IngestWS(cfg config.Config, hub *ws.Hub) gin.HandlerFunc {
	return func(c *gin.Context) {
		if cfg.OpenF1IngestToken != "" {
			token := strings.TrimSpace(c.Query("token"))
			if token == "" || token != strings.TrimSpace(cfg.OpenF1IngestToken) {
				c.Status(401)
				return
			}
		}

		conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			return
		}
		defer conn.Close()

		for {
			mt, b, err := conn.ReadMessage()
			if err != nil {
				return
			}
			if mt != 1 {
				continue
			}
			var body any
			if err := json.Unmarshal(b, &body); err != nil {
				body = map[string]any{"topic": "raw", "payload": string(b)}
			}
			msg := normalizeOpenF1Event(body)
			_ = hub.BroadcastJSON(msg)
		}
	}
}

func normalizeOpenF1Event(body any) any {
	m, _ := body.(map[string]any)
	if m == nil {
		return gin.H{
			"topic":           "raw",
			"payload":         body,
			"source":          "ingest",
			"received_at_utc": nowUTCISO8601(),
		}
	}
	topic, _ := m["topic"].(string)
	payload := m["payload"]
	if strings.TrimSpace(topic) == "" {
		topic = "raw"
	}
	return gin.H{
		"topic":           topic,
		"payload":         payload,
		"source":          "ingest",
		"received_at_utc": nowUTCISO8601(),
	}
}
