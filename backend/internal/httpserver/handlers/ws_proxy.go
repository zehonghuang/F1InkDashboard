package handlers

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"toinc_f1_backend/internal/config"
	"toinc_f1_backend/internal/model"
	"toinc_f1_backend/internal/wsclient"

	"github.com/gin-gonic/gin"
)

func wsClientOrFail(c *gin.Context, cfg config.Config, client *wsclient.Client) *wsclient.Client {
	if client == nil || !client.Enabled() {
		c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "ws_server_unavailable"})
		return nil
	}
	return client
}

func AdminF1LiveTimingProxy(cfg config.Config, client *wsclient.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !adminTokenOK(c, cfg.AdminToken) {
			return
		}
		cli := wsClientOrFail(c, cfg, client)
		if cli == nil {
			return
		}
		var out gin.H
		if err := cli.GetJSON("/internal/snapshot/f1/live-timing", &out); err != nil {
			LogReqError(c, "admin_f1_live_timing_proxy", "ws_client_error", err)
			c.JSON(http.StatusBadGateway, model.ErrorResponse{Ok: false, Error: "ws_downstream_error"})
			return
		}
		c.JSON(http.StatusOK, out)
	}
}

func MpF1LiveTimingProxy(cfg config.Config, client *wsclient.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		cli := wsClientOrFail(c, cfg, client)
		if cli == nil {
			return
		}
		var out gin.H
		if err := cli.GetJSON("/internal/snapshot/f1/live-timing", &out); err != nil {
			LogReqError(c, "mp_f1_live_timing_proxy", "ws_client_error", err)
			c.JSON(http.StatusBadGateway, model.ErrorResponse{Ok: false, Error: "ws_downstream_error"})
			return
		}
		c.JSON(http.StatusOK, out)
	}
}

func MpMotorsportLiveProxy(cfg config.Config, client *wsclient.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		cli := wsClientOrFail(c, cfg, client)
		if cli == nil {
			return
		}
		var out gin.H
		if err := cli.GetJSON("/internal/snapshot/motorsport/live", &out); err != nil {
			LogReqError(c, "mp_motorsport_live_proxy", "ws_client_error", err)
			c.JSON(http.StatusBadGateway, model.ErrorResponse{Ok: false, Error: "ws_downstream_error"})
			return
		}
		c.JSON(http.StatusOK, out)
	}
}

func WsStatusProxy(cfg config.Config, client *wsclient.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !adminTokenOK(c, cfg.AdminToken) {
			return
		}
		cli := wsClientOrFail(c, cfg, client)
		if cli == nil {
			return
		}
		var out gin.H
		if err := cli.GetJSON("/api/v1/ws/status", &out); err != nil {
			LogReqError(c, "ws_status_proxy", "ws_client_error", err)
			c.JSON(http.StatusBadGateway, model.ErrorResponse{Ok: false, Error: "ws_downstream_error"})
			return
		}
		c.JSON(http.StatusOK, out)
	}
}

func WsBroadcastProxy(cfg config.Config, client *wsclient.Client, mode string) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !adminTokenOK(c, cfg.AdminToken) {
			return
		}
		cli := wsClientOrFail(c, cfg, client)
		if cli == nil {
			return
		}
		body, err := io.ReadAll(c.Request.Body)
		if err != nil {
			c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: err.Error()})
			return
		}
		reqURL := strings.TrimRight(cfg.WSServerBaseURL, "/")
		token := strings.TrimSpace(cfg.WSServerInternalToken)
		switch mode {
		case "text":
			reqURL += "/internal/broadcast/echo/text?internal_token=" + url.QueryEscape(token)
		case "json":
			reqURL += "/internal/broadcast/echo/json?internal_token=" + url.QueryEscape(token)
		default:
			reqURL += "/internal/broadcast/echo/json?internal_token=" + url.QueryEscape(token)
		}
		req, err := http.NewRequest(http.MethodPost, reqURL, bytes.NewReader(body))
		if err != nil {
			c.JSON(http.StatusInternalServerError, model.ErrorResponse{Ok: false, Error: err.Error()})
			return
		}
		req.Header.Set("Content-Type", "application/json")
		if token != "" {
			req.Header.Set("X-WS-Internal-Token", token)
		}
		hc := &http.Client{Timeout: 8e9}
		res, err := hc.Do(req)
		if err != nil {
			LogReqError(c, "ws_broadcast_proxy", "downstream_error", err)
			c.JSON(http.StatusBadGateway, model.ErrorResponse{Ok: false, Error: "ws_downstream_error"})
			return
		}
		defer res.Body.Close()
		raw, err := io.ReadAll(res.Body)
		if err != nil {
			c.JSON(http.StatusInternalServerError, model.ErrorResponse{Ok: false, Error: err.Error()})
			return
		}
		c.Data(res.StatusCode, "application/json", raw)
	}
}

func NewsWsStatusProxy(cfg config.Config, client *wsclient.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !adminTokenOK(c, cfg.AdminToken) {
			return
		}
		cli := wsClientOrFail(c, cfg, client)
		if cli == nil {
			return
		}
		var out gin.H
		if err := cli.GetJSON("/api/v1/news/ws/status", &out); err != nil {
			LogReqError(c, "news_ws_status_proxy", "ws_client_error", err)
			c.JSON(http.StatusBadGateway, model.ErrorResponse{Ok: false, Error: "ws_downstream_error"})
			return
		}
		c.JSON(http.StatusOK, out)
	}
}

func OpenF1StatusProxy(cfg config.Config, client *wsclient.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !adminTokenOK(c, cfg.AdminToken) {
			return
		}
		cli := wsClientOrFail(c, cfg, client)
		if cli == nil {
			return
		}
		var out gin.H
		if err := cli.GetJSON("/api/v1/openf1/ws/status", &out); err != nil {
			LogReqError(c, "openf1_ws_status_proxy", "ws_client_error", err)
			c.JSON(http.StatusBadGateway, model.ErrorResponse{Ok: false, Error: "ws_downstream_error"})
			return
		}
		c.JSON(http.StatusOK, out)
	}
}

func NewsWsIngestProxy(cfg config.Config, client *wsclient.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !adminTokenOK(c, cfg.AdminToken) {
			return
		}
		if !checkToken(c, cfg.NewsIngestToken) {
			return
		}
		staticDir := strings.TrimSpace(cfg.StaticDir)
		if staticDir == "" {
			staticDir = "./static"
		}

		contentType := strings.ToLower(c.Request.Header.Get("Content-Type"))
		var fileRel string
		if strings.Contains(contentType, "multipart/form-data") {
			form, err := c.MultipartForm()
			if err == nil && form != nil && len(form.File["file"]) > 0 {
				fh := form.File["file"][0]
				uploadDir := filepath.Join(staticDir, "news", "ingest")
				_ = os.MkdirAll(uploadDir, 0o755)
				ext := safeExtFromFilename(fh.Filename)
				if ext == "" {
					ext = ".bin"
				}
				dest := filepath.Join(uploadDir, randHex(16)+ext)
				if err := c.SaveUploadedFile(fh, dest); err != nil {
					c.JSON(http.StatusInternalServerError, model.ErrorResponse{Ok: false, Error: err.Error()})
					return
				}
				if rel, err := filepath.Rel(staticDir, dest); err == nil {
					fileRel = "/" + filepath.ToSlash(rel)
				}
			}
		}

		cli := wsClientOrFail(c, cfg, client)
		if cli == nil {
			return
		}
		var payload any
		if strings.Contains(contentType, "multipart/form-data") {
			payload = map[string]any{
				"time":  c.PostForm("time"),
				"title": c.PostForm("title"),
				"intro": c.PostForm("intro"),
				"text":  c.PostForm("text"),
				"meme":  c.PostForm("meme"),
				"file":  fileRel,
			}
		} else {
			body := map[string]any{}
			if err := c.BindJSON(&body); err != nil {
				c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: err.Error()})
				return
			}
			payload = body
		}
		var out gin.H
		if err := cli.PostJSON("/internal/broadcast/news", payload, &out); err != nil {
			LogReqError(c, "news_ws_ingest_proxy", "downstream_error", err)
			c.JSON(http.StatusBadGateway, model.ErrorResponse{Ok: false, Error: "ws_downstream_error"})
			return
		}
		c.JSON(http.StatusOK, out)
	}
}

func OpenF1IngestProxy(cfg config.Config, client *wsclient.Client, mode string) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !adminTokenOK(c, cfg.AdminToken) {
			return
		}
		if !checkToken(c, cfg.OpenF1IngestToken) {
			return
		}
		cli := wsClientOrFail(c, cfg, client)
		if cli == nil {
			return
		}

		body, err := io.ReadAll(c.Request.Body)
		if err != nil {
			c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: err.Error()})
			return
		}
		contentType := strings.ToLower(c.Request.Header.Get("Content-Type"))
		path := "/internal/broadcast/openf1/fw"
		if mode == "raw" {
			path = "/internal/broadcast/openf1/raw"
		}
		reqURL := strings.TrimRight(cfg.WSServerBaseURL, "/") + path
		token := strings.TrimSpace(cfg.WSServerInternalToken)

		var reader io.Reader
		isJSON := true
		if strings.Contains(contentType, "application/json") {
			reader = bytes.NewReader(body)
		} else if looksLikeJSONText(string(body)) {
			reader = bytes.NewReader(body)
		} else {
			isJSON = false
			payload := map[string]any{"payload": strings.TrimSpace(string(body))}
			data, err := json.Marshal(payload)
			if err != nil {
				c.JSON(http.StatusInternalServerError, model.ErrorResponse{Ok: false, Error: err.Error()})
				return
			}
			reader = bytes.NewReader(data)
			body = data
			_ = body
		}

		req, err := http.NewRequest(http.MethodPost, reqURL+"?internal_token="+url.QueryEscape(token), reader)
		if err != nil {
			c.JSON(http.StatusInternalServerError, model.ErrorResponse{Ok: false, Error: err.Error()})
			return
		}
		req.Header.Set("Content-Type", "application/json")
		if token != "" {
			req.Header.Set("X-WS-Internal-Token", token)
		}
		_ = isJSON
		hc := &http.Client{Timeout: 8e9}
		res, err := hc.Do(req)
		if err != nil {
			LogReqError(c, "openf1_ingest_proxy", "downstream_error", err)
			c.JSON(http.StatusBadGateway, model.ErrorResponse{Ok: false, Error: "ws_downstream_error"})
			return
		}
		defer res.Body.Close()
		raw, err := io.ReadAll(res.Body)
		if err != nil {
			c.JSON(http.StatusInternalServerError, model.ErrorResponse{Ok: false, Error: err.Error()})
			return
		}
		c.Data(res.StatusCode, "application/json", raw)
	}
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
