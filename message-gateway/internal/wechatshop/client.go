package wechatshop

import (
	"bytes"
	"context"
	"crypto/sha1"
	"encoding/hex"
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
	expected := hex.EncodeToString(h[:])
	return strings.EqualFold(expected, signature)
}

type webhookEnvelope struct {
	ToUserName   string          `json:"ToUserName"`
	FromUserName string          `json:"FromUserName"`
	CreateTime   int64           `json:"CreateTime"`
	MsgType      string          `json:"MsgType"`
	Event        string          `json:"Event"`
	Content      string          `json:"Content"`
	MsgID        string          `json:"MsgId"`
	PicURL       string          `json:"PicUrl"`
	MediaID      string          `json:"MediaId"`
	Title        string          `json:"Title"`
	Description  string          `json:"Description"`
	URL          string          `json:"Url"`
	ProductID    string          `json:"ProductId"`
	HeadImage    string          `json:"HeadImage"`
	NickName     string          `json:"NickName"`
	ShopAppID    string          `json:"shop_app_id"`
	OpenID       string          `json:"openid"`
	Raw          json.RawMessage `json:"-"`
}

func (c *Client) ParseWebhookEvent(body []byte) (*model.PlatformEvent, error) {
	var env webhookEnvelope
	if err := json.Unmarshal(body, &env); err != nil {
		return nil, err
	}
	eventType := env.Event
	if eventType == "" {
		eventType = "msg_" + env.MsgType
	}
	eventID := env.MsgID
	if eventID == "" {
		eventID = fmt.Sprintf("evt_%d_%s", env.CreateTime, env.OpenID)
	}
	return &model.PlatformEvent{
		Platform:       model.PlatformWechatShop,
		EventType:      eventType,
		EventID:        eventID,
		PlatformUID:    env.OpenID,
		ConversationID: env.OpenID,
		ShopID:         env.ShopAppID,
		RawPayload:     string(body),
	}, nil
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
