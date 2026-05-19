package handlers

import (
	"io"
	"net/http"
	"strings"

	"toinc_f1_backend/internal/config"
	"toinc_f1_backend/internal/wechatpay"

	"github.com/gin-gonic/gin"
)

func WechatPayJSAPIPrepay(cfg config.Config) gin.HandlerFunc {
	client, initErr := wechatpay.NewClient(cfg.WechatPay)

	return func(c *gin.Context) {
		if initErr != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"ok": false, "error": "wechatpay_unavailable"})
			return
		}
		if !checkToken(c, cfg.WechatPay.ApiToken) {
			return
		}

		var in struct {
			Description string `json:"description"`
			OutTradeNo  string `json:"out_trade_no"`
			Total       int64  `json:"total"`
			Currency    string `json:"currency"`
			OpenID      string `json:"openid"`
			Attach      string `json:"attach"`
		}
		if err := c.ShouldBindJSON(&in); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "bad_json"})
			return
		}

		params, err := client.CreateJSAPIPrepay(c.Request.Context(), wechatpay.JSAPIPrepayRequest{
			Description: in.Description,
			OutTradeNo:  in.OutTradeNo,
			Total:       in.Total,
			Currency:    in.Currency,
			OpenID:      in.OpenID,
			Attach:      in.Attach,
		})
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": strings.TrimSpace(err.Error())})
			return
		}

		c.JSON(http.StatusOK, gin.H{"ok": true, "params": params})
	}
}

func WechatPayQueryOrder(cfg config.Config) gin.HandlerFunc {
	client, initErr := wechatpay.NewClient(cfg.WechatPay)

	return func(c *gin.Context) {
		if initErr != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"ok": false, "error": "wechatpay_unavailable"})
			return
		}
		if !checkToken(c, cfg.WechatPay.ApiToken) {
			return
		}

		outTradeNo := strings.TrimSpace(c.Param("out_trade_no"))
		out, err := client.QueryOrderByOutTradeNo(c.Request.Context(), outTradeNo)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": strings.TrimSpace(err.Error())})
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true, "order": out})
	}
}

func WechatPayNotify(cfg config.Config) gin.HandlerFunc {
	client, initErr := wechatpay.NewClient(cfg.WechatPay)

	return func(c *gin.Context) {
		if initErr != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"code": "FAIL", "message": "unavailable"})
			return
		}

		serial := c.GetHeader("Wechatpay-Serial")
		signature := c.GetHeader("Wechatpay-Signature")
		timestamp := c.GetHeader("Wechatpay-Timestamp")
		nonce := c.GetHeader("Wechatpay-Nonce")

		// 微信支付回调验签的原文格式固定为：
		// timestamp + "\n" + nonce + "\n" + body + "\n"
		// 验签公钥来自平台证书（不是商户私钥对应的证书）。
		body, err := io.ReadAll(io.LimitReader(c.Request.Body, 1024*1024))
		if err != nil || len(body) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"code": "FAIL", "message": "bad_body"})
			return
		}

		res, err := client.VerifyAndDecryptNotify(serial, timestamp, nonce, signature, body)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"code": "FAIL", "message": "invalid"})
			return
		}

		c.Set("wechatpay_serial", res.SerialNo)
		c.Set("wechatpay_plain", string(res.Plain))

		// 回调成功必须返回 {"code":"SUCCESS","message":"成功"}，否则微信会重试通知。
		c.JSON(http.StatusOK, gin.H{"code": "SUCCESS", "message": "成功"})
	}
}
