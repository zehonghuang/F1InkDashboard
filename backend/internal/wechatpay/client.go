package wechatpay

import (
	"bytes"
	"context"
	"crypto/rsa"
	"crypto/x509"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"toinc_f1_backend/internal/config"
)

// Client 负责对接微信支付 V3：
// - API 请求签名（WECHATPAY2-SHA256-RSA2048）
// - 订单接口（JSAPI 下单、按 out_trade_no 查单）
// - 回调验签与通知解密（平台证书 + APIv3Key）
type Client struct {
	cfg        config.WechatPayConfig
	httpClient *http.Client

	mchKey        *rsa.PrivateKey
	platformCerts map[string]*x509.Certificate
}

func NewClient(cfg config.WechatPayConfig) (*Client, error) {
	if !cfg.Enabled {
		return nil, errors.New("wechatpay_disabled")
	}
	if strings.TrimSpace(cfg.MchID) == "" || strings.TrimSpace(cfg.AppID) == "" {
		return nil, errors.New("missing_mchid_or_appid")
	}
	if strings.TrimSpace(cfg.SerialNo) == "" {
		return nil, errors.New("missing_merchant_cert_serial")
	}
	privPEM := []byte(strings.TrimSpace(cfg.PrivateKey))
	if len(privPEM) == 0 && strings.TrimSpace(cfg.KeyPath) != "" {
		b, err := os.ReadFile(cfg.KeyPath)
		if err != nil {
			return nil, err
		}
		privPEM = b
	}
	if len(privPEM) == 0 {
		return nil, errors.New("missing_merchant_private_key")
	}
	key, err := parseRSAPrivateKeyFromPEM(privPEM)
	if err != nil {
		return nil, err
	}
	certs, err := parseX509CertificatesFromPEM([]byte(strings.TrimSpace(cfg.PlatformCertPEM)))
	if err != nil {
		return nil, err
	}

	return &Client{
		cfg:           cfg,
		httpClient:    &http.Client{Timeout: 15 * time.Second},
		mchKey:        key,
		platformCerts: certs,
	}, nil
}

type JSAPIPrepayParams struct {
	AppID     string `json:"appId"`
	TimeStamp string `json:"timeStamp"`
	NonceStr  string `json:"nonceStr"`
	Package   string `json:"package"`
	SignType  string `json:"signType"`
	PaySign   string `json:"paySign"`

	PrepayID string `json:"prepay_id"`
}

type JSAPIPrepayRequest struct {
	Description string `json:"description"`
	OutTradeNo  string `json:"out_trade_no"`
	Total       int64  `json:"total"`
	Currency    string `json:"currency"`
	OpenID      string `json:"openid"`
	Attach      string `json:"attach"`
}

func (c *Client) CreateJSAPIPrepay(ctx context.Context, req JSAPIPrepayRequest) (JSAPIPrepayParams, error) {
	if strings.TrimSpace(req.Description) == "" {
		return JSAPIPrepayParams{}, errors.New("missing_description")
	}
	if strings.TrimSpace(req.OutTradeNo) == "" {
		return JSAPIPrepayParams{}, errors.New("missing_out_trade_no")
	}
	if req.Total <= 0 {
		return JSAPIPrepayParams{}, errors.New("invalid_total")
	}
	if strings.TrimSpace(req.OpenID) == "" {
		return JSAPIPrepayParams{}, errors.New("missing_openid")
	}
	currency := strings.TrimSpace(req.Currency)
	if currency == "" {
		currency = "CNY"
	}
	if strings.TrimSpace(c.cfg.NotifyURL) == "" {
		return JSAPIPrepayParams{}, errors.New("missing_notify_url")
	}

	body := map[string]any{
		"appid":        c.cfg.AppID,
		"mchid":        c.cfg.MchID,
		"description":  req.Description,
		"out_trade_no": req.OutTradeNo,
		"notify_url":   c.cfg.NotifyURL,
		"amount": map[string]any{
			"total":    req.Total,
			"currency": currency,
		},
		"payer": map[string]any{
			"openid": req.OpenID,
		},
	}
	if s := strings.TrimSpace(req.Attach); s != "" {
		body["attach"] = s
	}

	var out struct {
		PrepayID string `json:"prepay_id"`
	}
	if err := c.doJSON(ctx, http.MethodPost, "/v3/pay/transactions/jsapi", nil, body, &out); err != nil {
		return JSAPIPrepayParams{}, err
	}
	if strings.TrimSpace(out.PrepayID) == "" {
		return JSAPIPrepayParams{}, errors.New("missing_prepay_id")
	}

	ts := fmt.Sprintf("%d", time.Now().Unix())
	nonce := randHex(16)
	pkg := "prepay_id=" + out.PrepayID
	msg := c.cfg.AppID + "\n" + ts + "\n" + nonce + "\n" + pkg + "\n"
	sig, err := signRSASHA256(c.mchKey, msg)
	if err != nil {
		return JSAPIPrepayParams{}, err
	}

	return JSAPIPrepayParams{
		AppID:     c.cfg.AppID,
		TimeStamp: ts,
		NonceStr:  nonce,
		Package:   pkg,
		SignType:  "RSA",
		PaySign:   sig,
		PrepayID:  out.PrepayID,
	}, nil
}

type OrderQueryResponse struct {
	TransactionID  string `json:"transaction_id"`
	OutTradeNo     string `json:"out_trade_no"`
	TradeState     string `json:"trade_state"`
	TradeStateDesc string `json:"trade_state_desc"`
}

func (c *Client) QueryOrderByOutTradeNo(ctx context.Context, outTradeNo string) (OrderQueryResponse, error) {
	s := strings.TrimSpace(outTradeNo)
	if s == "" {
		return OrderQueryResponse{}, errors.New("missing_out_trade_no")
	}
	q := url.Values{}
	q.Set("mchid", c.cfg.MchID)

	var out OrderQueryResponse
	if err := c.doJSON(ctx, http.MethodGet, "/v3/pay/transactions/out-trade-no/"+url.PathEscape(s), q, nil, &out); err != nil {
		return OrderQueryResponse{}, err
	}
	return out, nil
}

type NotifyResult struct {
	SerialNo string
	Plain    []byte
}

func (c *Client) VerifyAndDecryptNotify(serial, timestamp, nonce, signatureBase64 string, body []byte) (NotifyResult, error) {
	serial = strings.ToUpper(strings.TrimSpace(serial))
	cert, ok := c.platformCerts[serial]
	if !ok {
		return NotifyResult{}, errors.New("unknown_platform_serial")
	}

	msg := strings.TrimSpace(timestamp) + "\n" + strings.TrimSpace(nonce) + "\n" + string(body) + "\n"
	if err := verifyRSASHA256(cert.PublicKey.(*rsa.PublicKey), msg, signatureBase64); err != nil {
		return NotifyResult{}, errors.New("invalid_notify_signature")
	}

	var wrapper struct {
		Resource EncryptedResource `json:"resource"`
	}
	if err := json.Unmarshal(body, &wrapper); err != nil {
		return NotifyResult{}, errors.New("bad_json")
	}
	plain, err := decryptAES256GCM(c.cfg.ApiV3Key, wrapper.Resource)
	if err != nil {
		return NotifyResult{}, err
	}
	return NotifyResult{SerialNo: serial, Plain: plain}, nil
}

func (c *Client) doJSON(ctx context.Context, method, path string, query url.Values, reqBody any, respOut any) error {
	u := "https://api.mch.weixin.qq.com" + path
	if query != nil && len(query) > 0 {
		u += "?" + query.Encode()
	}

	var bodyBytes []byte
	if reqBody != nil {
		b, err := json.Marshal(reqBody)
		if err != nil {
			return err
		}
		bodyBytes = b
	}

	req, err := http.NewRequestWithContext(ctx, method, u, bytes.NewReader(bodyBytes))
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")

	auth, err := c.authorizationHeader(method, path, query, bodyBytes)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", auth)

	res, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()

	raw, err := io.ReadAll(io.LimitReader(res.Body, 2*1024*1024))
	if err != nil {
		return err
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return fmt.Errorf("wechatpay_http_%d: %s", res.StatusCode, strings.TrimSpace(string(raw)))
	}
	if respOut == nil {
		return nil
	}
	if err := json.Unmarshal(raw, respOut); err != nil {
		return err
	}
	return nil
}

func (c *Client) authorizationHeader(method, path string, query url.Values, body []byte) (string, error) {
	ts := fmt.Sprintf("%d", time.Now().Unix())
	nonce := randHex(16)

	pathWithQuery := path
	if query != nil && len(query) > 0 {
		pathWithQuery += "?" + query.Encode()
	}

	msg := method + "\n" + pathWithQuery + "\n" + ts + "\n" + nonce + "\n" + string(body) + "\n"
	sig, err := signRSASHA256(c.mchKey, msg)
	if err != nil {
		return "", err
	}

	return fmt.Sprintf(
		`WECHATPAY2-SHA256-RSA2048 mchid="%s",nonce_str="%s",signature="%s",timestamp="%s",serial_no="%s"`,
		c.cfg.MchID, nonce, sig, ts, c.cfg.SerialNo,
	), nil
}
