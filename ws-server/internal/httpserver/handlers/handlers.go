package handlers

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"f1ink_ws_server/internal/config"
	"f1ink_ws_server/internal/f1livetiming"
	"f1ink_ws_server/internal/model"
	"f1ink_ws_server/internal/motorsportlive"
	"f1ink_ws_server/internal/util"
	"f1ink_ws_server/internal/ws"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

var _ = filepath.Base

type OpenF1IngestMode int

const (
	OpenF1IngestTextMode OpenF1IngestMode = iota
	OpenF1IngestJSONMode
	OpenF1IngestFWRawMode
	OpenF1IngestBinaryMode
)

type SharedState struct {
	HubEcho               *ws.Hub
	HubNews               *ws.Hub
	HubOpenF1FW           *ws.Hub
	HubOpenF1Raw          *ws.Hub
	HubF1LiveTiming       *ws.Hub
	HubMotorsportLive     *ws.Hub
	F1LiveTimingManager   *f1livetiming.Manager
	MotorsportLiveManager *motorsportlive.Manager
}

var wsUpgrader = websocket.Upgrader{
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

func init() {
	logRequests := true
	switch strings.ToLower(strings.TrimSpace(os.Getenv("WS_SERVER_LOG_REQUESTS"))) {
	case "0", "false", "off", "no":
		logRequests = false
	}
	_ = logRequests
}

func LogReqError(c *gin.Context, endpoint, reason string, err error) {
	_ = c
	_ = endpoint
	_ = reason
	_ = err
}

func adminTokenOK(c *gin.Context, adminToken string) bool {
	expected := strings.TrimSpace(adminToken)
	if expected == "" {
		return true
	}
	headerToken := strings.TrimSpace(c.GetHeader("X-Admin-Token"))
	if headerToken == expected {
		return true
	}
	c.JSON(http.StatusUnauthorized, model.ErrorResponse{Ok: false, Error: "unauthorized"})
	return false
}

func ingestTokenOK(c *gin.Context, expectedToken, tokenName string) bool {
	expected := strings.TrimSpace(expectedToken)
	if expected == "" {
		return true
	}
	headerToken := strings.TrimSpace(c.GetHeader(tokenName))
	if headerToken == expected {
		return true
	}
	c.JSON(http.StatusUnauthorized, model.ErrorResponse{Ok: false, Error: "unauthorized"})
	return false
}

type internalAuth struct {
	enabled bool
	token   string
	once    sync.Once
}

func (a *internalAuth) setup(cfg config.Config) {
	a.once.Do(func() {
		a.token = strings.TrimSpace(cfg.InternalToken)
		a.enabled = a.token != ""
	})
}

func (a *internalAuth) middleware(cfg config.Config) gin.HandlerFunc {
	a.setup(cfg)
	return func(c *gin.Context) {
		if !a.enabled {
			c.Next()
			return
		}
		token := strings.TrimSpace(c.GetHeader("X-WS-Internal-Token"))
		if token == "" {
			token = strings.TrimSpace(c.Query("internal_token"))
		}
		if token != a.token {
			c.AbortWithStatusJSON(http.StatusUnauthorized, model.ErrorResponse{Ok: false, Error: "unauthorized"})
			return
		}
		c.Next()
	}
}

var globalInternalAuth = &internalAuth{}

func InternalAuthMiddleware(cfg config.Config) gin.HandlerFunc {
	return globalInternalAuth.middleware(cfg)
}

func AttachInternalAPI(r *gin.RouterGroup, cfg config.Config, shared *SharedState) {
	group := r.Group("")
	group.Use(InternalAuthMiddleware(cfg))

	group.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"ok":   true,
			"time": util.NowUTCISO8601(),
		})
	})

	group.POST("/broadcast/echo/text", func(c *gin.Context) {
		var body struct {
			Message string `json:"message"`
		}
		if err := c.BindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: err.Error()})
			return
		}
		sent := shared.HubEcho.BroadcastText(body.Message)
		c.JSON(http.StatusOK, model.WsBroadcastResponse{Ok: true, Sent: sent})
	})
	group.POST("/broadcast/echo/json", func(c *gin.Context) {
		var payload any
		if err := c.BindJSON(&payload); err != nil {
			c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: err.Error()})
			return
		}
		sent := shared.HubEcho.BroadcastJSON(payload)
		c.JSON(http.StatusOK, model.WsBroadcastResponse{Ok: true, Sent: sent})
	})

	group.POST("/broadcast/news", func(c *gin.Context) {
		var topic string
		var payload any
		contentType := strings.ToLower(c.Request.Header.Get("Content-Type"))
		if strings.Contains(contentType, "application/json") {
			var body model.NewsIngestJSONBody
			if err := c.BindJSON(&body); err != nil {
				c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: err.Error()})
				return
			}
			topic = strings.TrimSpace(body.Topic)
			payload = body.Payload
		} else {
			topic = strings.TrimSpace(c.PostForm("topic"))
			if strings.TrimSpace(topic) == "" {
				c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: "missing_topic"})
				return
			}
			payload = map[string]any{
				"time":  c.PostForm("time"),
				"title": c.PostForm("title"),
				"intro": c.PostForm("intro"),
				"text":  c.PostForm("text"),
				"meme":  c.PostForm("meme"),
				"file":  c.Query("file"),
			}
		}
		if topic == "" {
			topic = "general"
		}
		envelope := map[string]any{
			"type":    "news",
			"topic":   topic,
			"payload": payload,
			"time":    util.NowUTCISO8601(),
		}
		sent := shared.HubNews.BroadcastJSON(envelope)
		c.JSON(http.StatusOK, gin.H{"ok": true, "topic": topic, "sent": sent})
	})

	group.POST("/broadcast/openf1/fw", func(c *gin.Context) {
		payload, mode, ok := readOpenF1IngestPayload(c, "X-OpenF1-Ingest-Token", cfg.OpenF1IngestToken)
		if !ok {
			return
		}
		sent := 0
		switch mode {
		case OpenF1IngestJSONMode:
			sent = shared.HubOpenF1FW.BroadcastJSON(payload)
		case OpenF1IngestTextMode:
			sent = shared.HubOpenF1FW.BroadcastText(payload.(string))
		default:
			c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: "invalid_payload"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true, "sent": sent, "mode": "fw"})
	})

	group.POST("/broadcast/openf1/raw", func(c *gin.Context) {
		payload, mode, ok := readOpenF1IngestPayload(c, "X-OpenF1-Ingest-Token", cfg.OpenF1IngestToken)
		if !ok {
			return
		}
		sent := 0
		switch mode {
		case OpenF1IngestJSONMode:
			sent = shared.HubOpenF1Raw.BroadcastJSON(payload)
		case OpenF1IngestTextMode:
			sent = shared.HubOpenF1Raw.BroadcastText(payload.(string))
		default:
			c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: "invalid_payload"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true, "sent": sent, "mode": "raw"})
	})

	group.GET("/snapshot/f1/live-timing", func(c *gin.Context) {
		if shared.F1LiveTimingManager == nil {
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "service_unavailable"})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"ok":               true,
			"generated_at_utc": util.NowUTCISO8601(),
			"source":           "f1_live_timing",
			"status":           shared.F1LiveTimingManager.Snapshot(),
		})
	})

	group.GET("/snapshot/motorsport/live", func(c *gin.Context) {
		if shared.MotorsportLiveManager == nil {
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "service_unavailable"})
			return
		}
		snap := shared.MotorsportLiveManager.Snapshot()
		c.JSON(http.StatusOK, gin.H{
			"ok":               true,
			"generated_at_utc": util.NowUTCISO8601(),
			"source":           "motorsport_ws",
			"status":           snap,
		})
	})
}

func readOpenF1IngestPayload(c *gin.Context, tokenHeader, expectedToken string) (any, OpenF1IngestMode, bool) {
	if !ingestTokenOK(c, expectedToken, tokenHeader) {
		return nil, OpenF1IngestBinaryMode, false
	}
	contentType := strings.ToLower(c.Request.Header.Get("Content-Type"))
	switch {
	case strings.Contains(contentType, "application/x-ndjson"),
		strings.Contains(contentType, "application/octet-stream"):
		raw, err := io.ReadAll(c.Request.Body)
		if err != nil {
			c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: err.Error()})
			return nil, OpenF1IngestBinaryMode, false
		}
		return strings.TrimSpace(string(raw)), OpenF1IngestTextMode, true
	case strings.Contains(contentType, "application/json"):
		var payload any
		if err := c.BindJSON(&payload); err != nil {
			c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: err.Error()})
			return nil, OpenF1IngestBinaryMode, false
		}
		return payload, OpenF1IngestJSONMode, true
	}
	raw, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: err.Error()})
		return nil, OpenF1IngestBinaryMode, false
	}
	text := strings.TrimSpace(string(raw))
	if text == "" {
		return nil, OpenF1IngestBinaryMode, false
	}
	if looksLikeJSONText(text) {
		var payload any
		if err := json.Unmarshal([]byte(text), &payload); err == nil {
			return payload, OpenF1IngestJSONMode, true
		}
	}
	return text, OpenF1IngestTextMode, true
}

func looksLikeJSONText(text string) bool {
	text = strings.TrimSpace(text)
	if len(text) == 0 {
		return false
	}
	first := text[0]
	last := text[len(text)-1]
	switch first {
	case '{':
		return last == '}'
	case '[':
		return last == ']'
	}
	return false
}

func HandleWS(hub *ws.Hub, cfg config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		conn, err := wsUpgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			LogReqError(c, "ws_"+hubName(c.Request.URL.Path), "upgrade_error", err)
			c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: "ws_upgrade_failed"})
			return
		}
		defer conn.Close()
		hub.Add(conn)
		defer hub.Remove(conn)
		_ = cfg
		_ = conn.SetReadDeadline(time.Time{})
		for {
			mt, message, err := conn.ReadMessage()
			if err != nil {
				break
			}
			if mt == websocket.PingMessage {
				_ = conn.WriteMessage(websocket.PongMessage, nil)
				continue
			}
			_ = message
		}
	}
}

func HandleWSEcho(hub *ws.Hub, cfg config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		conn, err := wsUpgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: "ws_upgrade_failed"})
			return
		}
		defer conn.Close()
		hub.Add(conn)
		defer hub.Remove(conn)
		_ = cfg
		for {
			mt, message, err := conn.ReadMessage()
			if err != nil {
				break
			}
			if mt == websocket.PingMessage {
				_ = conn.WriteMessage(websocket.PongMessage, nil)
				continue
			}
			hub.BroadcastText(string(message))
		}
	}
}

func hubName(path string) string {
	return strings.Trim(strings.ReplaceAll(path, "/", "_"), "_")
}

func WsEchoStatus(hub *ws.Hub, cfg config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !adminTokenOK(c, cfg.AdminToken) {
			return
		}
		c.JSON(http.StatusOK, model.WsStatusResponse{Ok: true, Clients: hub.Count()})
	}
}

func WsBroadcastText(hub *ws.Hub, cfg config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !adminTokenOK(c, cfg.AdminToken) {
			return
		}
		var body struct {
			Message string `json:"message"`
		}
		if err := c.BindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: err.Error()})
			return
		}
		sent := hub.BroadcastText(body.Message)
		c.JSON(http.StatusOK, model.WsBroadcastResponse{Ok: true, Sent: sent})
	}
}

func WsBroadcastJSON(hub *ws.Hub, cfg config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !adminTokenOK(c, cfg.AdminToken) {
			return
		}
		var payload any
		if err := c.BindJSON(&payload); err != nil {
			c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: err.Error()})
			return
		}
		sent := hub.BroadcastJSON(payload)
		c.JSON(http.StatusOK, model.WsBroadcastResponse{Ok: true, Sent: sent})
	}
}

func WsNewsStatus(hub *ws.Hub, cfg config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !adminTokenOK(c, cfg.AdminToken) {
			return
		}
		c.JSON(http.StatusOK, model.NewsWsStatusResponse{
			Enabled: cfg.NewsWsEnabled,
			Running: cfg.NewsWsEnabled,
			Clients: model.NewsWsClients{Ws: hub.Count()},
		})
	}
}

func WsNewsIngest(cfg config.Config, hub *ws.Hub) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !adminTokenOK(c, cfg.AdminToken) {
			return
		}
		if !ingestTokenOK(c, cfg.NewsIngestToken, "X-News-Ingest-Token") {
			return
		}
		staticDir := strings.TrimSpace(cfg.StaticDir)
		if staticDir == "" {
			staticDir = "./static"
		}

		var topic string
		var payload any

		contentType := strings.ToLower(c.Request.Header.Get("Content-Type"))
		if strings.Contains(contentType, "multipart/form-data") {
			topic = strings.TrimSpace(c.PostForm("topic"))
			if topic == "" {
				c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: "missing_topic"})
				return
			}
			filePath := ""
			form, err := c.MultipartForm()
			if err == nil && form != nil && len(form.File["file"]) > 0 {
				fileHeader := form.File["file"][0]
				uploadDir := filepath.Join(staticDir, "news", "ingest")
				_ = os.MkdirAll(uploadDir, 0o755)
				ext := util.SafeExtFromFilename(fileHeader.Filename)
				if ext == "" {
					ext = ".bin"
				}
				dest := filepath.Join(uploadDir, util.RandHex(16)+ext)
				if err := c.SaveUploadedFile(fileHeader, dest); err != nil {
					c.JSON(http.StatusInternalServerError, model.ErrorResponse{Ok: false, Error: err.Error()})
					return
				}
				rel, err := filepath.Rel(staticDir, dest)
				if err == nil {
					filePath = "/" + filepath.ToSlash(rel)
				}
			}
			payload = map[string]any{
				"time":  c.PostForm("time"),
				"title": c.PostForm("title"),
				"intro": c.PostForm("intro"),
				"text":  c.PostForm("text"),
				"meme":  c.PostForm("meme"),
				"file":  filePath,
			}
		} else if strings.Contains(contentType, "application/json") {
			var body model.NewsIngestJSONBody
			if err := c.BindJSON(&body); err != nil {
				c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: err.Error()})
				return
			}
			topic = strings.TrimSpace(body.Topic)
			if topic == "" {
				c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: "missing_topic"})
				return
			}
			payload = body.Payload
		} else {
			c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: "bad_content_type"})
			return
		}

		if topic == "" {
			topic = "general"
		}
		envelope := map[string]any{
			"type":    "news",
			"topic":   topic,
			"payload": payload,
			"time":    util.NowUTCISO8601(),
		}
		sent := hub.BroadcastJSON(envelope)
		c.JSON(http.StatusOK, gin.H{"ok": true, "topic": topic, "sent": sent})
	}
}

func WsOpenF1Status(hubFW, hubRaw *ws.Hub, cfg config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !adminTokenOK(c, cfg.AdminToken) {
			return
		}
		c.JSON(http.StatusOK, model.OpenF1StatusResponse{
			Enabled:   cfg.OpenF1Enabled,
			Mode:      strings.TrimSpace(cfg.OpenF1Mode),
			Running:   cfg.OpenF1Enabled,
			Connected: cfg.OpenF1Enabled,
			Clients: model.OpenF1Clients{
				WsFW:  hubFW.Count(),
				WsRaw: hubRaw.Count(),
			},
		})
	}
}

func WsOpenF1IngestFW(hub *ws.Hub, cfg config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !adminTokenOK(c, cfg.AdminToken) {
			return
		}
		payload, mode, ok := readOpenF1IngestPayload(c, "X-OpenF1-Ingest-Token", cfg.OpenF1IngestToken)
		if !ok {
			return
		}
		sent := 0
		switch mode {
		case OpenF1IngestJSONMode:
			sent = hub.BroadcastJSON(payload)
		case OpenF1IngestTextMode:
			sent = hub.BroadcastText(payload.(string))
		default:
			c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: "invalid_payload"})
			return
		}
		c.JSON(http.StatusOK, model.WsBroadcastResponse{Ok: true, Sent: sent})
	}
}

func WsOpenF1IngestRaw(hub *ws.Hub, cfg config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !adminTokenOK(c, cfg.AdminToken) {
			return
		}
		payload, mode, ok := readOpenF1IngestPayload(c, "X-OpenF1-Ingest-Token", cfg.OpenF1IngestToken)
		if !ok {
			return
		}
		sent := 0
		switch mode {
		case OpenF1IngestJSONMode:
			sent = hub.BroadcastJSON(payload)
		case OpenF1IngestTextMode:
			sent = hub.BroadcastText(payload.(string))
		default:
			c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: "invalid_payload"})
			return
		}
		c.JSON(http.StatusOK, model.WsBroadcastResponse{Ok: true, Sent: sent})
	}
}

func WsMotorsportLiveStandings(cfg config.Config, manager *motorsportlive.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !adminTokenOK(c, cfg.AdminToken) {
			return
		}
		if manager == nil {
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "service_unavailable"})
			return
		}
		snap := manager.Snapshot()
		rows := []model.AdminMotorsportStandingRow{}
		sourceURL := ""
		liveTimingURL := ""
		status := ""
		sessionTitle := ""
		fetchedAt := ""
		if snap.LatestStandings != nil {
			rows = snap.LatestStandings.Rows
			status = snap.LatestStandings.Status
			sessionTitle = snap.LatestStandings.SessionTitle
			fetchedAt = snap.LatestStandings.ParsedAtUTC
			if snap.LatestStandings.LiveTimingID != "" {
				liveTimingURL = "https://www.motorsport.com/live-timing/" + snap.LatestStandings.LiveTimingID + "/"
			}
			sourceURL = liveTimingURL
		}
		c.JSON(http.StatusOK, gin.H{
			"ok":              true,
			"source_url":      sourceURL,
			"live_timing_url": liveTimingURL,
			"status":          status,
			"session_title":   sessionTitle,
			"fetched_at_utc":  fetchedAt,
			"rows":            rows,
		})
	}
}

func WsF1LiveTimingAdmin(cfg config.Config, manager *f1livetiming.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !adminTokenOK(c, cfg.AdminToken) {
			return
		}
		if manager == nil {
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "service_unavailable"})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"ok":               true,
			"generated_at_utc": util.NowUTCISO8601(),
			"status":           manager.Snapshot(),
		})
	}
}
