package xiaohongshu

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"msg-gateway/internal/config"
	"msg-gateway/internal/model"
	"msg-gateway/internal/platform"
)

type Client struct {
	cfg        config.XiaohongshuConfig
	httpClient *http.Client

	mu          sync.Mutex
	accessToken string
	tokenExpAt  time.Time
}

func NewClient(cfg config.XiaohongshuConfig) (*Client, error) {
	if !cfg.Enabled {
		return nil, errors.New("xhs_disabled")
	}
	if strings.TrimSpace(cfg.AppID) == "" {
		return nil, errors.New("missing_appid")
	}
	if strings.TrimSpace(cfg.AppSecret) == "" {
		return nil, errors.New("missing_app_secret")
	}
	return &Client{
		cfg:        cfg,
		httpClient: &http.Client{Timeout: 15 * time.Second},
	}, nil
}

type xhsAPIError struct {
	Code int    `json:"code"`
	Msg  string `json:"msg"`
}

func (e *xhsAPIError) Error() string {
	return fmt.Sprintf("xhs_api code=%d msg=%s", e.Code, e.Msg)
}

type tokenResponse struct {
	AccessToken string `json:"access_token"`
	ExpiresIn   int64  `json:"expires_in"`
	xhsAPIError
}

func (c *Client) GetAccessToken(ctx context.Context) (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	now := time.Now()
	if c.accessToken != "" && now.Before(c.tokenExpAt.Add(-30*time.Second)) {
		return c.accessToken, nil
	}

	if strings.TrimSpace(c.cfg.AccessToken) != "" {
		c.accessToken = strings.TrimSpace(c.cfg.AccessToken)
		c.tokenExpAt = now.Add(30 * 24 * time.Hour)
		return c.accessToken, nil
	}

	u := "https://ark.xiaohongshu.com/oauth2/token"
	reqBody := map[string]any{
		"client_id":     c.cfg.AppID,
		"client_secret": c.cfg.AppSecret,
		"grant_type":    "client_credentials",
	}
	bodyBytes, _ := json.Marshal(reqBody)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, u, bytes.NewReader(bodyBytes))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")

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
	if r.Code != 0 {
		return "", &xhsAPIError{Code: r.Code, Msg: r.Msg}
	}
	if strings.TrimSpace(r.AccessToken) == "" {
		return "", errors.New("empty_access_token")
	}
	expSec := r.ExpiresIn
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
	u := "https://ark.xiaohongshu.com" + path

	var bodyBytes []byte
	if reqBody != nil {
		b, err := json.Marshal(reqBody)
		if err != nil {
			return err
		}
		bodyBytes = b
	}
	log.Printf("[xhs] REQ %s %s body=%s", method, path, strings.TrimSpace(string(bodyBytes)))

	req, err := http.NewRequestWithContext(ctx, method, u, bytes.NewReader(bodyBytes))
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", "Bearer "+tok)
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
	log.Printf("[xhs] RES %s %s status=%d body=%s", method, path, resp.StatusCode, respPreview)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("xhs_http_%d: %s", resp.StatusCode, strings.TrimSpace(string(raw)))
	}

	var errCheck xhsAPIError
	_ = json.Unmarshal(raw, &errCheck)
	if errCheck.Code != 0 {
		return &xhsAPIError{Code: errCheck.Code, Msg: errCheck.Msg}
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
	secret := c.cfg.NotifyToken
	signingPayload := timestamp + "\n" + nonce + "\n" + body + "\n"
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(signingPayload))
	expected := hex.EncodeToString(mac.Sum(nil))
	return strings.EqualFold(expected, signature)
}

type xhsWebhook struct {
	EventType string          `json:"event_type"`
	EventID   string          `json:"event_id"`
	EventTime int64           `json:"event_time"`
	Data      json.RawMessage `json:"data"`
}

type xhsMsgData struct {
	ConversationID string `json:"conversation_id"`
	UserID         string `json:"user_id"`
	MessageID      string `json:"message_id"`
	MessageType    string `json:"message_type"`
	Content        string `json:"content"`
}

func (c *Client) ParseWebhookEvent(body []byte) (*model.PlatformEvent, error) {
	var env xhsWebhook
	if err := json.Unmarshal(body, &env); err != nil {
		return nil, err
	}
	eventID := env.EventID
	if eventID == "" {
		eventID = fmt.Sprintf("evt_%d_%s", env.EventTime, env.EventType)
	}
	var platformUID, conversationID string
	var msg xhsMsgData
	if len(env.Data) > 0 {
		_ = json.Unmarshal(env.Data, &msg)
		platformUID = msg.UserID
		conversationID = msg.ConversationID
	}
	return &model.PlatformEvent{
		Platform:       model.PlatformXiaohongshu,
		EventType:      env.EventType,
		EventID:        eventID,
		PlatformUID:    platformUID,
		ConversationID: conversationID,
		RawPayload:     string(body),
	}, nil
}

func (c *Client) SendMessage(ctx context.Context, payload platform.MessagePayload) (string, error) {
	body := map[string]any{
		"conversation_id": payload.PlatformUID,
		"message_type":    payload.MsgType,
	}
	switch payload.MsgType {
	case model.MsgTypeText:
		body["content"] = map[string]any{
			"text": payload.Content,
		}
	case model.MsgTypeImage:
		body["content"] = map[string]any{
			"url": payload.MediaURL,
		}
	case model.MsgTypeLink:
		body["content"] = map[string]any{
			"title":       payload.LinkTitle,
			"url":         payload.LinkURL,
			"desc":        payload.Content,
			"cover_url":   payload.MediaURL,
		}
	case model.MsgTypeProduct:
		body["content"] = map[string]any{
			"product_id": payload.ProductID,
		}
	default:
		return "", fmt.Errorf("unsupported_msg_type: %s", payload.MsgType)
	}

	var out struct {
		Data struct {
			MessageID string `json:"message_id"`
		} `json:"data"`
		xhsAPIError
	}
	if err := c.doAPI(ctx, http.MethodPost, "/api/ark/v1/im/message/send", body, &out); err != nil {
		return "", err
	}
	return out.Data.MessageID, nil
}

func (c *Client) MarkConversationRead(ctx context.Context, conversationID, platformUID string) error {
	body := map[string]any{
		"conversation_id": conversationID,
	}
	return c.doAPI(ctx, http.MethodPost, "/api/ark/v1/im/conversation/read", body, nil)
}
