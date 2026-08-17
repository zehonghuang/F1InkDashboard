package wechatshop

import (
	"bytes"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/sha1"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"msg-gateway/internal/config"
	"msg-gateway/internal/model"
	"msg-gateway/internal/platform"
)

const (
	EventOrderNew = "channels_ec_order_new"
	EventOrderPay = "channels_ec_order_pay"
)

type flexInt64 int64

func (f *flexInt64) UnmarshalJSON(data []byte) error {
	data = bytes.TrimSpace(data)
	if len(data) == 0 || bytes.Equal(data, []byte(`null`)) {
		*f = 0
		return nil
	}
	if data[0] == '"' {
		var s string
		if err := json.Unmarshal(data, &s); err != nil {
			return err
		}
		s = strings.TrimSpace(s)
		if s == "" {
			*f = 0
			return nil
		}
		n, err := strconv.ParseInt(s, 10, 64)
		if err != nil {
			fn, ferr := strconv.ParseFloat(s, 64)
			if ferr != nil {
				return err
			}
			*f = flexInt64(int64(fn))
			return nil
		}
		*f = flexInt64(n)
		return nil
	}
	var n int64
	if err := json.Unmarshal(data, &n); err == nil {
		*f = flexInt64(n)
		return nil
	}
	var fn float64
	if err := json.Unmarshal(data, &fn); err != nil {
		return err
	}
	*f = flexInt64(int64(fn))
	return nil
}

type flexInt int

func (f *flexInt) UnmarshalJSON(data []byte) error {
	var v flexInt64
	if err := json.Unmarshal(data, &v); err != nil {
		return err
	}
	*f = flexInt(int(v))
	return nil
}

type Client struct {
	cfg        config.WechatShopConfig
	httpClient *http.Client

	mu          sync.Mutex
	accessToken string
	tokenExpAt  time.Time
}

func NewClient(cfg config.WechatShopConfig) (*Client, error) {
	if !cfg.Enabled {
		return nil, errors.New("wechatshop_disabled")
	}
	if strings.TrimSpace(cfg.AppID) == "" {
		return nil, errors.New("missing_appid")
	}
	if strings.TrimSpace(cfg.Secret) == "" {
		return nil, errors.New("missing_secret")
	}
	return &Client{
		cfg:        cfg,
		httpClient: &http.Client{Timeout: 15 * time.Second},
	}, nil
}

type apiError struct {
	ErrCode int    `json:"errcode"`
	ErrMsg  string `json:"errmsg"`
}

func (e *apiError) Error() string {
	return fmt.Sprintf("wechatshop_api errcode=%d errmsg=%s", e.ErrCode, e.ErrMsg)
}

type tokenResponse struct {
	AccessToken string  `json:"access_token"`
	ExpiresIn   flexInt `json:"expires_in"`
	apiError
}

func (c *Client) GetAccessToken(ctx context.Context) (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	now := time.Now()
	if c.accessToken != "" && now.Before(c.tokenExpAt.Add(-30*time.Second)) {
		return c.accessToken, nil
	}

	u := "https://api.weixin.qq.com/cgi-bin/token"
	q := url.Values{}
	q.Set("grant_type", "client_credential")
	q.Set("appid", c.cfg.AppID)
	q.Set("secret", c.cfg.Secret)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u+"?"+q.Encode(), nil)
	if err != nil {
		return "", err
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(io.LimitReader(resp.Body, 64*1024))
	if err != nil {
		return "", err
	}
	var r tokenResponse
	if err := json.Unmarshal(raw, &r); err != nil {
		return "", err
	}
	if r.ErrCode != 0 {
		return "", &apiError{ErrCode: r.ErrCode, ErrMsg: r.ErrMsg}
	}
	if strings.TrimSpace(r.AccessToken) == "" {
		return "", errors.New("empty_access_token")
	}
	expSec := int(r.ExpiresIn)
	if expSec <= 0 {
		expSec = 7200
	}
	c.accessToken = strings.TrimSpace(r.AccessToken)
	c.tokenExpAt = now.Add(time.Duration(expSec) * time.Second)
	return c.accessToken, nil
}

func (c *Client) doAPI(ctx context.Context, method, path string, reqBody any, respOut any) error {
	tok, err := c.GetAccessToken(ctx)
	if err != nil {
		return err
	}
	u := "https://api.weixin.qq.com" + path
	q := url.Values{}
	q.Set("access_token", tok)
	u += "?" + q.Encode()

	var bodyBytes []byte
	if reqBody != nil {
		b, err := json.Marshal(reqBody)
		if err != nil {
			return err
		}
		bodyBytes = b
	}
	log.Printf("[wechatshop] REQ %s %s body=%s", method, path, strings.TrimSpace(string(bodyBytes)))

	req, err := http.NewRequestWithContext(ctx, method, u, bytes.NewReader(bodyBytes))
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	if bodyBytes != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(io.LimitReader(resp.Body, 4*1024*1024))
	if err != nil {
		return err
	}
	respPreview := strings.TrimSpace(string(raw))
	if len(respPreview) > 4096 {
		respPreview = respPreview[:4096] + "...(truncated)"
	}
	log.Printf("[wechatshop] RES %s %s status=%d body=%s", method, path, resp.StatusCode, respPreview)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("wechatshop_http_%d: %s", resp.StatusCode, strings.TrimSpace(string(raw)))
	}

	var errCheck apiError
	_ = json.Unmarshal(raw, &errCheck)
	if errCheck.ErrCode != 0 {
		return &apiError{ErrCode: errCheck.ErrCode, ErrMsg: errCheck.ErrMsg}
	}
	if respOut == nil {
		return nil
	}
	return json.Unmarshal(raw, respOut)
}

func (c *Client) VerifyWebhookSignature(signature, timestamp, nonce, body string) bool {
	if c.cfg.NotifyToken == "" {
		return false
	}
	token := c.cfg.NotifyToken
	arr := []string{token, timestamp, nonce}
	sort.Strings(arr)
	joined := strings.Join(arr, "")
	h := sha1.Sum([]byte(joined))
	expected := strings.ToLower(hex.EncodeToString(h[:]))
	return strings.ToLower(signature) == expected
}

type msgSignatureInput struct {
	Token     string
	Timestamp string
	Nonce     string
	Encrypt   string
}

func sha1Hex(s ...string) string {
	sort.Strings(s)
	h := sha1.Sum([]byte(strings.Join(s, "")))
	return strings.ToLower(hex.EncodeToString(h[:]))
}

func (c *Client) VerifyMsgSignature(msgSignature, timestamp, nonce, encrypt string) bool {
	if c.cfg.NotifyToken == "" {
		return false
	}
	expected := sha1Hex(c.cfg.NotifyToken, timestamp, nonce, encrypt)
	return strings.ToLower(msgSignature) == expected
}

type encryptedEnvelope struct {
	ToUserName string `json:"ToUserName"`
	Encrypt    string `json:"Encrypt"`
}

type flexString string

func (f *flexString) UnmarshalJSON(data []byte) error {
	trimmed := strings.TrimSpace(string(data))
	if trimmed == `""` || trimmed == `null` {
		*f = ""
		return nil
	}
	if len(trimmed) >= 2 && trimmed[0] == '"' && trimmed[len(trimmed)-1] == '"' {
		*f = flexString(trimmed[1 : len(trimmed)-1])
		return nil
	}
	*f = flexString(trimmed)
	return nil
}

type OrderInfo struct {
	OrderID flexString `json:"order_id"`
	PayTime int64      `json:"pay_time,omitempty"`
}

type webhookEnvelope struct {
	ToUserName   string    `json:"ToUserName"`
	FromUserName string    `json:"FromUserName"`
	CreateTime   int64     `json:"CreateTime"`
	MsgType      string    `json:"MsgType"`
	Event        string    `json:"Event"`
	OrderInfo    OrderInfo `json:"order_info"`

	Content   string `json:"Content"`
	MsgID     string `json:"MsgId"`
	PicURL    string `json:"PicUrl"`
	MediaID   string `json:"MediaId"`
	Title     string `json:"Title"`
	URL       string `json:"Url"`
	ProductID string `json:"ProductId"`
	NickName  string `json:"NickName"`
	HeadImage string `json:"HeadImage"`
	ShopAppID string `json:"shop_app_id"`
	OpenID    string `json:"openid"`
}

func ExtractEncryptFromBody(body []byte) (string, error) {
	body = bytes.TrimSpace(body)
	if len(body) == 0 {
		return "", errors.New("empty_body")
	}
	var env encryptedEnvelope
	if err := json.Unmarshal(body, &env); err != nil {
		return "", fmt.Errorf("parse json envelope: %w", err)
	}
	enc := strings.TrimSpace(env.Encrypt)
	if enc == "" {
		return "", errors.New("missing_encrypt_field")
	}
	return enc, nil
}

func (c *Client) DecryptEvent(aesKey, encrypted string) (msg []byte, appid string, err error) {
	aesKey = strings.TrimSpace(aesKey)
	key, err := base64.StdEncoding.DecodeString(aesKey + "=")
	if err != nil {
		return nil, "", fmt.Errorf("decode aes key: %w", err)
	}
	if len(key) != 32 {
		key = padAESKey(key)
	}
	cipherBlock, err := aes.NewCipher(key)
	if err != nil {
		return nil, "", err
	}
	raw, err := base64.StdEncoding.DecodeString(encrypted)
	if err != nil {
		return nil, "", fmt.Errorf("decode encrypt: %w", err)
	}
	if len(raw) < aes.BlockSize || len(raw)%aes.BlockSize != 0 {
		return nil, "", fmt.Errorf("invalid cipher length %d", len(raw))
	}
	iv := raw[:aes.BlockSize]
	mode := cipher.NewCBCDecrypter(cipherBlock, iv)
	out := make([]byte, len(raw))
	mode.CryptBlocks(out, raw)
	out = pkcs7Unpad(out)
	if len(out) <= 20+aes.BlockSize {
		return nil, "", fmt.Errorf("decrypted too short: %d", len(out))
	}
	offset := aes.BlockSize
	content := out[offset+4:]
	msgLen := binary.BigEndian.Uint32(out[offset : offset+4])
	if int(msgLen) > len(content) {
		return nil, "", fmt.Errorf("msg_len %d > content %d", msgLen, len(content))
	}
	msgBytes := content[:msgLen]
	remaining := content[msgLen:]
	appid = string(bytes.TrimSpace(remaining))
	return msgBytes, appid, nil
}

func padAESKey(key []byte) []byte {
	out := make([]byte, 32)
	copy(out, key)
	return out
}

func pkcs7Unpad(b []byte) []byte {
	if len(b) == 0 {
		return b
	}
	pad := int(b[len(b)-1])
	if pad < 1 || pad > aes.BlockSize || pad > len(b) {
		return b
	}
	for i := len(b) - pad; i < len(b); i++ {
		if int(b[i]) != pad {
			return b
		}
	}
	return b[:len(b)-pad]
}

func parseWechatBody(body []byte) (string, error) {
	body = bytes.TrimSpace(body)
	if len(body) == 0 {
		return "", errors.New("empty_body")
	}
	first := body[0]
	if first == '{' {
		var env encryptedEnvelope
		if err := json.Unmarshal(body, &env); err != nil {
			return "", err
		}
		enc := strings.TrimSpace(env.Encrypt)
		if enc == "" {
			return "", errors.New("missing_encrypt")
		}
		return enc, nil
	}
	return "", fmt.Errorf("unsupported_body_format: body must be JSON (starts with '{')")
}

func (c *Client) ParseWebhookEvent(rawBody []byte) (*model.PlatformEvent, error) {
	body := bytes.TrimSpace(rawBody)
	if len(body) == 0 {
		return nil, errors.New("empty_body")
	}

	var encryptedStr string
	if body[0] == '{' {
		var env encryptedEnvelope
		if err := json.Unmarshal(body, &env); err != nil {
			return nil, fmt.Errorf("parse json envelope: %w", err)
		}
		encryptedStr = strings.TrimSpace(env.Encrypt)
	}

	plaintext := body
	if encryptedStr != "" && strings.TrimSpace(c.cfg.AESKey) != "" {
		dec, decryptedAppID, err := c.DecryptEvent(c.cfg.AESKey, encryptedStr)
		if err != nil {
			log.Printf("[wechatshop] decrypt fallback, treat body as plain. err=%v", err)
		} else {
			plaintext = dec
			expectedAppID := strings.TrimSpace(c.cfg.AppID)
			gotAppID := strings.TrimSpace(decryptedAppID)
			if expectedAppID != "" && gotAppID != "" && expectedAppID != gotAppID {
				return nil, fmt.Errorf("decrypted appid mismatch: expected=%s got=%s", expectedAppID, gotAppID)
			}
		}
	}

	var env webhookEnvelope
	if err := json.Unmarshal(plaintext, &env); err != nil {
		return nil, fmt.Errorf("parse json: %w", err)
	}

	orderID := string(env.OrderInfo.OrderID)
	openID := env.FromUserName
	if openID == "" {
		openID = env.OpenID
	}
	shopAppID := env.ShopAppID
	if shopAppID == "" {
		shopAppID = env.ToUserName
	}

	eventType := env.Event
	if eventType == "" {
		eventType = "msg_" + env.MsgType
	}

	eventID := env.MsgID
	if eventID == "" {
		if orderID != "" {
			eventID = fmt.Sprintf("%s_%s_%d", eventType, orderID, env.CreateTime)
		} else {
			eventID = fmt.Sprintf("evt_%s_%d", eventType, env.CreateTime)
		}
	}

	ev := &model.PlatformEvent{
		Platform:       model.PlatformWechatShop,
		EventType:      eventType,
		EventID:        eventID,
		PlatformUID:    openID,
		ConversationID: openID,
		ShopID:         shopAppID,
		OrderID:        orderID,
		RawPayload:     string(plaintext),
	}
	return ev, nil
}

func (c *Client) SendMessage(ctx context.Context, payload platform.MessagePayload) (string, error) {
	body := map[string]any{
		"touser":  payload.PlatformUID,
		"msgtype": payload.MsgType,
	}
	switch payload.MsgType {
	case model.MsgTypeText:
		body["text"] = map[string]any{
			"content": payload.Content,
		}
	case model.MsgTypeImage:
		body["image"] = map[string]any{
			"media_id": payload.MediaURL,
		}
	case model.MsgTypeLink:
		body["link"] = map[string]any{
			"title":       payload.LinkTitle,
			"description": payload.Content,
			"url":         payload.LinkURL,
			"thumb_url":   payload.MediaURL,
		}
	case model.MsgTypeMiniCard:
		body["miniprogrampage"] = map[string]any{
			"title":          payload.LinkTitle,
			"appid":          c.cfg.AppID,
			"pagepath":       payload.LinkURL,
			"thumb_media_id": payload.MediaURL,
		}
	default:
		return "", fmt.Errorf("unsupported_msg_type: %s", payload.MsgType)
	}

	var out struct {
		MsgID int64 `json:"msgid"`
		apiError
	}
	if err := c.doAPI(ctx, http.MethodPost, "/cgi-bin/message/custom/send", body, &out); err != nil {
		return "", err
	}
	return fmt.Sprintf("%d", out.MsgID), nil
}

func (c *Client) MarkConversationRead(ctx context.Context, conversationID, platformUID string) error {
	return nil
}

// ---------- 订单相关 API 调用 ----------

type OrderDetail struct {
	OrderID      string `json:"order_id"`
	Status       int    `json:"status"`
	OpenID       string `json:"openid"`
	CreateTime   int64  `json:"create_time"`
	PayTime      int64  `json:"pay_time"`
	PayAmount    int64  `json:"pay_amount"`
	ProductPrice int64  `json:"product_price"`
	Freight      int64  `json:"freight"`
	Discounted   int64  `json:"discounted_price"`
	OrderDetail  *struct {
		ProductInfos []OrderProduct `json:"product_infos"`
		PriceInfo    *OrderPrice    `json:"price_info"`
	} `json:"order_detail"`
	ExtInfo *struct {
		ProductSpu []OrderProduct `json:"product_spu"`
	} `json:"ext_info"`
}

type OrderProduct struct {
	SpuID       string `json:"spu_id"`
	ProductID   string `json:"product_id"`
	SkuID       string `json:"sku_id"`
	Title       string `json:"title"`
	ThumbImg    string `json:"thumb_img"`
	Count       int    `json:"count"`
	SalePrice   int64  `json:"sale_price"`
	ProductName string `json:"product_name"`
}

type OrderPrice struct {
	ProductPrice  int64 `json:"product_price"`
	Freight       int64 `json:"freight"`
	Discounted    int64 `json:"discounted_price"`
	OriginalPrice int64 `json:"original_price"`
	PayablePrice  int64 `json:"payable_price"`
	PayPrice      int64 `json:"pay_price"`
}

type getOrderResponseInner struct {
	Order struct {
		OrderID     string          `json:"order_id"`
		Status      int             `json:"status"`
		OpenID      string          `json:"openid"`
		CreateTime  int64           `json:"create_time"`
		PayTime     int64           `json:"pay_time"`
		OrderDetail json.RawMessage `json:"order_detail"`
		PriceInfo   json.RawMessage `json:"price_info"`
		ExtInfo     json.RawMessage `json:"ext_info"`
	} `json:"order"`
}

type getOrderResponse struct {
	Resp      getOrderResponseInner `json:"resp"`
	OrderInfo getOrderResponseInner `json:"order_info"`
	apiError
}

func (c *Client) GetOrderDetail(ctx context.Context, orderID string) (*OrderDetail, error) {
	orderID = strings.TrimSpace(orderID)
	if orderID == "" {
		return nil, errors.New("missing_order_id")
	}
	body := map[string]any{"order_id": orderID}
	var out getOrderResponse
	if err := c.doAPI(ctx, http.MethodPost, "/channels/ec/order/get", body, &out); err != nil {
		return nil, err
	}
	inner := out.OrderInfo
	if inner.Order.OrderID == "" && out.Resp.Order.OrderID != "" {
		inner = out.Resp
	}
	if inner.Order.OrderID == "" {
		return nil, errors.New("order_not_found")
	}
	od := &OrderDetail{
		OrderID:    inner.Order.OrderID,
		Status:     inner.Order.Status,
		OpenID:     inner.Order.OpenID,
		CreateTime: inner.Order.CreateTime,
		PayTime:    inner.Order.PayTime,
	}
	if len(inner.Order.OrderDetail) > 0 {
		od.OrderDetail = &struct {
			ProductInfos []OrderProduct `json:"product_infos"`
			PriceInfo    *OrderPrice    `json:"price_info"`
		}{}
		_ = json.Unmarshal(inner.Order.OrderDetail, od.OrderDetail)
	}
	if len(inner.Order.PriceInfo) > 0 && od.OrderDetail != nil {
		od.OrderDetail.PriceInfo = &OrderPrice{}
		_ = json.Unmarshal(inner.Order.PriceInfo, od.OrderDetail.PriceInfo)
		if od.OrderDetail.PriceInfo != nil {
			od.ProductPrice = od.OrderDetail.PriceInfo.ProductPrice
			od.Freight = od.OrderDetail.PriceInfo.Freight
			od.Discounted = od.OrderDetail.PriceInfo.Discounted
			od.PayAmount = od.OrderDetail.PriceInfo.PayPrice
		}
	}
	return od, nil
}

// ---------- hex encode helper ----------
var hex = hexString{}

type hexString struct{}

func (hexString) EncodeToString(src []byte) string {
	const hextable = "0123456789abcdef"
	dst := make([]byte, len(src)*2)
	j := 0
	for _, v := range src {
		dst[j] = hextable[v>>4]
		dst[j+1] = hextable[v&0x0f]
		j += 2
	}
	return string(dst)
}
