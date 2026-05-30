package handlers

import (
	"encoding/base64"
	"encoding/json"
	"io"
	"mime/multipart"
	"os"
	"path/filepath"
	"strings"

	"toinc_f1_backend/internal/config"
	"toinc_f1_backend/internal/ws"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

// @Summary 新闻 WS 状态
// @Description 返回新闻 WebSocket 的启用开关与在线人数。
// @Tags News
// @Produce json
// @Success 200 {object} GenericObject
// @Router /api/v1/news/ws/status [get]
func NewsWsStatus(cfg config.Config, hub *ws.Hub) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.JSON(200, gin.H{
			"enabled": cfg.NewsWsEnabled,
			"running": cfg.NewsWsEnabled,
			"clients": gin.H{"ws": hub.Count()},
		})
	}
}

// @Summary 新闻 WebSocket
// @Description 新闻推送 WebSocket。服务端会根据 topic 推送消息（如 v1/breaking、v1/meme）。
// @Tags News
// @Router /ws/news [get]
func WsNews(cfg config.Config, hub *ws.Hub) gin.HandlerFunc {
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
			"source": "news",
			"status": gin.H{
				"enabled": cfg.NewsWsEnabled,
				"running": cfg.NewsWsEnabled,
				"clients": gin.H{"ws": hub.Count()},
			},
		})

		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				return
			}
		}
	}
}

// @Summary 注入 Breaking 新闻（multipart）
// @Description |
//   通过 multipart/form-data 注入并广播到新闻 WS（topic 固定为 v1/breaking）。
//
//   鉴权：
//   - 若服务端配置 NEWS_INGEST_TOKEN 非空，则必须传 query token 且匹配。
// @Tags News
// @Accept mpfd
// @Produce json
// @Security TokenQuery
// @Param token query string false "鉴权 token（当 NEWS_INGEST_TOKEN 非空时必填）"
// @Param title formData string true "新闻标题"
// @Param image formData file false "可选图片文件"
// @Success 200 {object} OkResponse
// @Failure 400 {object} ErrorResponse
// @Failure 401 {object} ErrorResponse
// @Router /api/v1/news/ws/ingest [post]
func NewsWsIngest(cfg config.Config, hub *ws.Hub, staticDir string) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !checkToken(c, cfg.NewsIngestToken) {
			return
		}
		title := strings.TrimSpace(c.PostForm("title"))
		if title == "" {
			c.JSON(400, gin.H{"ok": false, "error": "missing_title"})
			return
		}

		var imageObj any
		fh, err := c.FormFile("image")
		if err == nil && fh != nil {
			url, mime, size, err := saveUploaded(staticDir, "news", fh)
			if err == nil {
				imageObj = gin.H{"url": url, "mime": mime, "bytes": size}
			}
		}

		msg := gin.H{
			"topic": "v1/breaking",
			"payload": gin.H{
				"title": title,
			},
			"source":          "ingest",
			"received_at_utc": nowUTCISO8601(),
		}
		if imageObj != nil {
			msg["payload"].(gin.H)["image"] = imageObj
		}

		_ = hub.BroadcastJSON(msg)
		c.JSON(200, gin.H{"ok": true})
	}
}

// @Summary 注入 Meme 新闻（multipart）
// @Description |
//   通过 multipart/form-data 注入并广播到新闻 WS（topic 固定为 v1/meme）。
//
//   鉴权：
//   - 若服务端配置 NEWS_INGEST_TOKEN 非空，则必须传 query token 且匹配。
// @Tags News
// @Accept mpfd
// @Produce json
// @Security TokenQuery
// @Param token query string false "鉴权 token（当 NEWS_INGEST_TOKEN 非空时必填）"
// @Param title formData string true "标题"
// @Param image formData file false "可选图片文件"
// @Param audio formData file false "可选音频文件"
// @Success 200 {object} OkResponse
// @Failure 400 {object} ErrorResponse
// @Failure 401 {object} ErrorResponse
// @Router /api/v1/news/meme/ws/ingest [post]
func NewsMemeWsIngest(cfg config.Config, hub *ws.Hub, staticDir string) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !checkToken(c, cfg.NewsIngestToken) {
			return
		}
		title := strings.TrimSpace(c.PostForm("title"))
		if title == "" {
			c.JSON(400, gin.H{"ok": false, "error": "missing_title"})
			return
		}

		var imageObj any
		var audioObj any

		if fh, err := c.FormFile("image"); err == nil && fh != nil {
			url, mime, size, err := saveUploaded(staticDir, "meme", fh)
			if err == nil {
				imageObj = gin.H{"url": url, "mime": mime, "bytes": size}
			}
		}
		if fh, err := c.FormFile("audio"); err == nil && fh != nil {
			url, mime, size, err := saveUploaded(staticDir, "meme", fh)
			if err == nil {
				audioObj = gin.H{"url": url, "mime": mime, "bytes": size}
			}
		}

		msg := gin.H{
			"topic": "v1/meme",
			"payload": gin.H{
				"title": title,
			},
			"source":          "ingest",
			"received_at_utc": nowUTCISO8601(),
		}
		if imageObj != nil {
			msg["payload"].(gin.H)["image"] = imageObj
		}
		if audioObj != nil {
			msg["payload"].(gin.H)["audio"] = audioObj
		}

		_ = hub.BroadcastJSON(msg)
		c.JSON(200, gin.H{"ok": true})
	}
}

// @Summary 注入新闻（JSON）
// @Description |
//   直接注入 JSON 并广播到新闻 WS。
//
//   - 未传 topic 时默认 v1/breaking
//   - 当 topic=v1/meme 时，服务端会把 payload.image / payload.audio 规范化为资产对象
//
//   鉴权：
//   - 若服务端配置 NEWS_INGEST_TOKEN 非空，则必须传 query token 且匹配。
// @Tags News
// @Accept json
// @Produce json
// @Security TokenQuery
// @Param token query string false "鉴权 token（当 NEWS_INGEST_TOKEN 非空时必填）"
// @Param body body NewsIngestJSONBody true "注入内容"
// @Success 200 {object} OkResponse
// @Failure 400 {object} ErrorResponse
// @Failure 401 {object} ErrorResponse
// @Router /api/v1/news/ingest [post]
func NewsIngestJSON(cfg config.Config, hub *ws.Hub, staticDir string) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !checkToken(c, cfg.NewsIngestToken) {
			return
		}
		var body map[string]any
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(400, gin.H{"ok": false, "error": "bad_json"})
			return
		}

		topic, _ := body["topic"].(string)
		topic = strings.TrimSpace(topic)
		if topic == "" {
			topic = "v1/breaking"
		}
		payload, _ := body["payload"].(map[string]any)
		if payload == nil {
			payload = map[string]any{}
		}

		if topic == "v1/meme" {
			if img := normalizeAssetObject(staticDir, "meme", payload["image"]); img != nil {
				payload["image"] = img
			}
			if aud := normalizeAssetObject(staticDir, "meme", payload["audio"]); aud != nil {
				payload["audio"] = aud
			}
		}

		msg := gin.H{
			"topic":           topic,
			"payload":         payload,
			"source":          "ingest",
			"received_at_utc": nowUTCISO8601(),
		}
		_ = hub.BroadcastJSON(msg)
		c.JSON(200, gin.H{"ok": true})
	}
}

func checkToken(c *gin.Context, expected string) bool {
	expected = strings.TrimSpace(expected)
	if expected == "" {
		return true
	}
	token := strings.TrimSpace(c.Query("token"))
	if token == "" || token != expected {
		c.JSON(401, gin.H{"ok": false, "error": "unauthorized"})
		return false
	}
	return true
}

func saveUploaded(staticDir, subDir string, fh *multipart.FileHeader) (string, string, int64, error) {
	ext := safeExtFromFilename(fh.Filename)
	if ext == "" {
		ext = ".bin"
	}
	name := randHex(12) + ext
	dir := filepath.Join(staticDir, subDir)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", "", 0, err
	}
	full := filepath.Join(dir, name)

	src, err := fh.Open()
	if err != nil {
		return "", "", 0, err
	}
	defer src.Close()

	dst, err := os.Create(full)
	if err != nil {
		return "", "", 0, err
	}
	defer dst.Close()

	wrote, err := io.Copy(dst, io.LimitReader(src, 8*1024*1024))
	if err != nil {
		_ = os.Remove(full)
		return "", "", 0, err
	}

	mime := strings.TrimSpace(fh.Header.Get("Content-Type"))
	url := "/static/" + subDir + "/" + name
	return url, mime, wrote, nil
}

func normalizeAssetObject(staticDir, subDir string, v any) any {
	obj, ok := v.(map[string]any)
	if !ok {
		return nil
	}
	if url, ok := obj["url"].(string); ok && strings.TrimSpace(url) != "" {
		out := map[string]any{"url": strings.TrimSpace(url)}
		if mime, ok := obj["mime"].(string); ok && strings.TrimSpace(mime) != "" {
			out["mime"] = strings.TrimSpace(mime)
		}
		return out
	}
	enc, _ := obj["encoding"].(string)
	data, _ := obj["data"].(string)
	mime, _ := obj["mime"].(string)
	if strings.EqualFold(strings.TrimSpace(enc), "base64") && strings.TrimSpace(data) != "" {
		raw, err := base64.StdEncoding.DecodeString(data)
		if err != nil || len(raw) == 0 {
			return nil
		}
		ext := ".bin"
		if strings.Contains(strings.ToLower(mime), "png") {
			ext = ".png"
		} else if strings.Contains(strings.ToLower(mime), "jpeg") || strings.Contains(strings.ToLower(mime), "jpg") {
			ext = ".jpg"
		} else if strings.Contains(strings.ToLower(mime), "webp") {
			ext = ".webp"
		} else if strings.Contains(strings.ToLower(mime), "wav") {
			ext = ".wav"
		}
		name := randHex(12) + ext
		dir := filepath.Join(staticDir, subDir)
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return nil
		}
		full := filepath.Join(dir, name)
		if err := os.WriteFile(full, raw, 0o644); err != nil {
			return nil
		}
		out := map[string]any{"url": "/static/" + subDir + "/" + name}
		if strings.TrimSpace(mime) != "" {
			out["mime"] = strings.TrimSpace(mime)
		}
		out["bytes"] = len(raw)
		return out
	}
	return nil
}

func broadcastRawJSON(hub *ws.Hub, b []byte) int {
	var v any
	if err := json.Unmarshal(b, &v); err != nil {
		return 0
	}
	return hub.BroadcastJSON(v)
}

func writeWSJSON(conn *websocket.Conn, v any) {
	_ = conn.WriteJSON(v)
}
