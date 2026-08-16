package handlers

import (
	"context"
	"net/http"
	"strconv"
	"strings"
	"time"

	"msg-gateway/internal/config"
	"msg-gateway/internal/message"
	"msg-gateway/internal/wechatshop"
	"msg-gateway/internal/xiaohongshu"

	"github.com/gin-gonic/gin"
)

type AppContext struct {
	Cfg           config.Config
	MessageSvc    *message.Service
	WechatShopCli *wechatshop.Client
	XhsCli        *xiaohongshu.Client
}

func Health() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status": "ok",
			"time":   time.Now().UTC().Format(time.RFC3339),
		})
	}
}

func AdminRequired(cfg config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		if cfg.Admin.Token == "" {
			c.Next()
			return
		}
		tok := c.GetHeader("X-Admin-Token")
		if tok == "" {
			tok = c.Query("admin_token")
		}
		if tok == "" || tok != cfg.Admin.Token {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}
		c.Next()
	}
}

type SendMessageRequest struct {
	Platform    string `json:"platform" binding:"required"`
	PlatformUID string `json:"platform_uid" binding:"required"`
	MsgType     string `json:"msg_type" binding:"required"`
	Content     string `json:"content"`
	MediaURL    string `json:"media_url"`
	LinkTitle   string `json:"link_title"`
	LinkURL     string `json:"link_url"`
	ProductID   string `json:"product_id"`
}

func SendMessage(app *AppContext) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req SendMessageRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
		defer cancel()

		msg, err := app.MessageSvc.SendMessage(ctx, message.SendParams{
			Platform:       req.Platform,
			PlatformUID:    req.PlatformUID,
			MsgType:        req.MsgType,
			Content:        req.Content,
			MediaURL:       req.MediaURL,
			LinkTitle:      req.LinkTitle,
			LinkURL:        req.LinkURL,
			ProductID:      req.ProductID,
		})
		if err != nil {
			c.JSON(http.StatusOK, gin.H{
				"ok":    false,
				"error": err.Error(),
				"msg":   msg,
			})
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true, "msg": msg})
	}
}

func ListConversations(app *AppContext) gin.HandlerFunc {
	return func(c *gin.Context) {
		page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
		pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
		plat := c.Query("platform")
		list, total, err := app.MessageSvc.ListConversations(c.Request.Context(), plat, page, pageSize)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true, "list": list, "total": total, "page": page, "page_size": pageSize})
	}
}

func ListMessages(app *AppContext) gin.HandlerFunc {
	return func(c *gin.Context) {
		convIDStr := c.Param("conversation_id")
		convID, err := strconv.ParseUint(convIDStr, 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_conversation_id"})
			return
		}
		page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
		pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "50"))
		list, total, err := app.MessageSvc.ListMessages(c.Request.Context(), convID, page, pageSize)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true, "list": list, "total": total})
	}
}

func WechatShopWebhookVerify(app *AppContext) gin.HandlerFunc {
	return func(c *gin.Context) {
		if app.WechatShopCli == nil {
			c.String(http.StatusServiceUnavailable, "wechatshop_disabled")
			return
		}
		signature := c.Query("signature")
		timestamp := c.Query("timestamp")
		nonce := c.Query("nonce")
		echostr := c.Query("echostr")
		if !app.WechatShopCli.VerifyWebhookSignature(signature, timestamp, nonce, "") {
			c.AbortWithStatus(http.StatusForbidden)
			return
		}
		c.String(http.StatusOK, echostr)
	}
}

func WechatShopWebhook(app *AppContext) gin.HandlerFunc {
	return func(c *gin.Context) {
		if app.WechatShopCli == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "wechatshop_disabled"})
			return
		}
		signature := c.Query("msg_signature")
		if signature == "" {
			signature = c.Query("signature")
		}
		timestamp := c.Query("timestamp")
		nonce := c.Query("nonce")
		body, err := c.GetRawData()
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "read_body_failed"})
			return
		}
		if !app.WechatShopCli.VerifyWebhookSignature(signature, timestamp, nonce, string(body)) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "invalid_signature"})
			return
		}
		event, err := app.WechatShopCli.ParseWebhookEvent(body)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
		defer cancel()
		_ = app.MessageSvc.IngestIncomingEvent(ctx, event)
		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}

func XiaohongshuWebhookVerify(app *AppContext) gin.HandlerFunc {
	return func(c *gin.Context) {
		if app.XhsCli == nil {
			c.String(http.StatusServiceUnavailable, "xhs_disabled")
			return
		}
		signature := c.GetHeader("X-Signature")
		timestamp := c.GetHeader("X-Timestamp")
		nonce := c.GetHeader("X-Nonce")
		echostr := c.Query("echostr")
		if !app.XhsCli.VerifyWebhookSignature(signature, timestamp, nonce, "") {
			c.AbortWithStatus(http.StatusForbidden)
			return
		}
		c.String(http.StatusOK, echostr)
	}
}

func XiaohongshuWebhook(app *AppContext) gin.HandlerFunc {
	return func(c *gin.Context) {
		if app.XhsCli == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "xhs_disabled"})
			return
		}
		signature := c.GetHeader("X-Signature")
		timestamp := c.GetHeader("X-Timestamp")
		nonce := c.GetHeader("X-Nonce")
		body, err := c.GetRawData()
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "read_body_failed"})
			return
		}
		if !app.XhsCli.VerifyWebhookSignature(signature, timestamp, nonce, string(body)) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "invalid_signature"})
			return
		}
		event, err := app.XhsCli.ParseWebhookEvent(body)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
		defer cancel()
		_ = app.MessageSvc.IngestIncomingEvent(ctx, event)
		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}

func RequestLogger(enabled bool) gin.HandlerFunc {
	if !enabled {
		return func(c *gin.Context) { c.Next() }
	}
	return gin.LoggerWithFormatter(func(param gin.LogFormatterParams) string {
		var statusColor, methodColor, resetColor string
		statusColor = colorForStatus(param.StatusCode)
		methodColor = colorForMethod(param.Method)
		resetColor = "\033[0m"
		return "[GIN] " +
			param.TimeStamp.Format("2006/01/02 - 15:04:05") + " |" +
			statusColor + " " + strconv.Itoa(param.StatusCode) + " " + resetColor + "|" +
			" " + param.Latency.String() + " | " +
			param.ClientIP + " | " +
			methodColor + " " + param.Method + " " + resetColor +
			"\"" + param.Path + "\"" +
			" " + param.ErrorMessage + "\n"
	})
}

func colorForStatus(code int) string {
	switch {
	case code >= 200 && code < 300:
		return "\033[42m"
	case code >= 300 && code < 400:
		return "\033[43m"
	case code >= 400 && code < 500:
		return "\033[41m"
	default:
		return "\033[45m"
	}
}

func colorForMethod(method string) string {
	m := strings.ToUpper(method)
	switch m {
	case "GET":
		return "\033[44m"
	case "POST":
		return "\033[42m"
	case "PUT":
		return "\033[43m"
	case "DELETE":
		return "\033[41m"
	case "PATCH":
		return "\033[46m"
	case "HEAD":
		return "\033[45m"
	case "OPTIONS":
		return "\033[47m"
	default:
		return "\033[40m"
	}
}
