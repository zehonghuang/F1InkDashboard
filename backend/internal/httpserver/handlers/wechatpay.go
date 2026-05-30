package handlers

import (
	"io"
	"net/http"
	"strings"

	"toinc_f1_backend/internal/config"
	"toinc_f1_backend/internal/wechatpay"

	"github.com/gin-gonic/gin"
)

// @Summary JSAPI 预下单
// @Description |
//   服务端透传并发起微信支付 JSAPI 下单流程。
//
//   鉴权：
//   - 使用 query token（通常与 WECHATPAY_API_TOKEN 配置一致）。
// @Tags WechatPay
// @Accept json
// @Produce json
// @Security TokenQuery
// @Param token query string false "鉴权 token（通常与 WECHATPAY_API_TOKEN 一致）"
// @Param body body WechatPayJSAPIPrepayRequest true "预下单请求"
// @Success 200 {object} GenericObject
// @Failure 400 {object} ErrorResponse
// @Failure 401 {object} ErrorResponse
// @Failure 503 {object} ErrorResponse
// @Router /api/v1/pay/wechat/jsapi/prepay [post]
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

		var in WechatPayJSAPIPrepayRequest
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

// @Summary 查询订单
// @Description |
//   鉴权：
//   - 使用 query token（通常与 WECHATPAY_API_TOKEN 配置一致）。
// @Tags WechatPay
// @Produce json
// @Security TokenQuery
// @Param token query string false "鉴权 token（通常与 WECHATPAY_API_TOKEN 一致）"
// @Param out_trade_no path string true "商户订单号"
// @Success 200 {object} GenericObject
// @Failure 400 {object} ErrorResponse
// @Failure 401 {object} ErrorResponse
// @Failure 503 {object} ErrorResponse
// @Router /api/v1/pay/wechat/order/{out_trade_no} [get]
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

// @Summary 支付回调通知
// @Description 微信支付回调入口，要求包含 Wechatpay-* 签名头；服务端验签并解密后处理。
// @Tags WechatPay
// @Accept json
// @Produce json
// @Param Wechatpay-Serial header string true "平台证书序列号"
// @Param Wechatpay-Signature header string true "签名值"
// @Param Wechatpay-Timestamp header string true "时间戳"
// @Param Wechatpay-Nonce header string true "随机串"
// @Param body body GenericObject true "回调报文"
// @Success 200 {object} GenericObject
// @Failure 400 {object} GenericObject
// @Failure 401 {object} GenericObject
// @Failure 503 {object} GenericObject
// @Router /api/v1/pay/wechat/notify [post]
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
