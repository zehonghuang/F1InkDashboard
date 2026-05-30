package handlers

import (
	"encoding/json"
	"strings"

	"toinc_f1_backend/internal/config"
	"toinc_f1_backend/internal/ws"

	"github.com/gin-gonic/gin"
)

// @Summary OpenF1 WS 状态
// @Description 返回 OpenF1 WebSocket 的启用开关、mode 与在线人数。
// @Tags OpenF1
// @Produce json
// @Success 200 {object} GenericObject
// @Router /api/v1/openf1/status [get]
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

// @Summary OpenF1 WebSocket
// @Description OpenF1 推送 WebSocket（根据 mode 可能推 mock 或真实数据）。
// @Tags OpenF1
// @Router /ws/openf1 [get]
// @Router /ws/openf1/raw [get]
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

// @Summary OpenF1 注入（JSON）
// @Description |
//   用 HTTP JSON 直接注入 OpenF1 消息。服务端会包装 received_at_utc、source 等字段后广播。
//
//   鉴权：
//   - 当 OPENF1_INGEST_TOKEN 非空时必须传 query token 并匹配；为空则允许匿名注入（仅建议用于内网/调试）。
// @Tags OpenF1
// @Accept json
// @Produce json
// @Security TokenQuery
// @Param token query string false "鉴权 token（当 OPENF1_INGEST_TOKEN 非空时必填）"
// @Param body body GenericObject true "任意 JSON"
// @Success 200 {object} OkResponse
// @Failure 400 {object} ErrorResponse
// @Failure 401 {object} ErrorResponse
// @Router /api/v1/openf1/ingest [post]
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

// @Summary OpenF1 WebSocket 注入
// @Description |
//   通过 WebSocket 文本帧注入 OpenF1 消息。
//
//   鉴权：
//   - 当 OPENF1_INGEST_TOKEN 非空时必须传 query token 并匹配；为空则允许匿名注入（仅建议用于内网/调试）。
// @Tags OpenF1
// @Security TokenQuery
// @Param token query string false "鉴权 token（当 OPENF1_INGEST_TOKEN 非空时必填）"
// @Router /ws/openf1/ingest [get]
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
