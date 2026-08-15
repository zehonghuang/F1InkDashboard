package wechatmini

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type Client struct {
	AppID      string
	Secret     string
	HTTPClient *http.Client
}

type Session struct {
	OpenID     string
	UnionID    string
	SessionKey string
}

type Code2SessionError struct {
	ErrCode int
	ErrMsg  string
}

func (e *Code2SessionError) Error() string {
	return fmt.Sprintf("wechatmini code2session failed: errcode=%d errmsg=%s", e.ErrCode, e.ErrMsg)
}

type code2SessionResponse struct {
	OpenID     string `json:"openid"`
	UnionID    string `json:"unionid"`
	SessionKey string `json:"session_key"`
	ErrCode    int    `json:"errcode"`
	ErrMsg     string `json:"errmsg"`
}

func (c *Client) Code2Session(ctx context.Context, jsCode string) (Session, error) {
	jsCode = strings.TrimSpace(jsCode)
	if jsCode == "" {
		return Session{}, fmt.Errorf("js_code required")
	}

	hc := c.HTTPClient
	if hc == nil {
		hc = &http.Client{Timeout: 8 * time.Second}
	}

	u := "https://api.weixin.qq.com/sns/jscode2session"
	q := url.Values{}
	q.Set("appid", c.AppID)
	secretForLog := maskSecret(c.Secret)
	q.Set("secret", c.Secret)
	q.Set("js_code", jsCode)
	q.Set("grant_type", "authorization_code")

	log.Printf("wechatmini code2session request: url=%s?appid=%s&secret=%s&js_code=%s&grant_type=authorization_code",
		u, c.AppID, secretForLog, maskCode(jsCode))

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u+"?"+q.Encode(), nil)
	if err != nil {
		log.Printf("wechatmini code2session build_request_failed: err=%v", err)
		return Session{}, err
	}

	resp, err := hc.Do(req)
	if err != nil {
		log.Printf("wechatmini code2session http_do_failed: err=%v", err)
		return Session{}, err
	}
	defer resp.Body.Close()

	b, err := io.ReadAll(resp.Body)
	if err != nil {
		log.Printf("wechatmini code2session read_body_failed: status=%d err=%v", resp.StatusCode, err)
		return Session{}, err
	}

	log.Printf("wechatmini code2session response: status=%d headers=%v body=%s",
		resp.StatusCode, formatHeaders(resp.Header), string(b))

	var r code2SessionResponse
	if err := json.Unmarshal(b, &r); err != nil {
		log.Printf("wechatmini code2session json_unmarshal_failed: err=%v body=%s", err, string(b))
		return Session{}, err
	}
	if r.ErrCode != 0 {
		log.Printf("wechatmini code2session api_error: errcode=%d errmsg=%s body=%s", r.ErrCode, r.ErrMsg, string(b))
		return Session{}, &Code2SessionError{ErrCode: r.ErrCode, ErrMsg: r.ErrMsg}
	}
	if strings.TrimSpace(r.OpenID) == "" {
		log.Printf("wechatmini code2session empty_openid: body=%s", string(b))
		return Session{}, fmt.Errorf("wechatmini code2session: empty openid")
	}

	return Session{
		OpenID:     strings.TrimSpace(r.OpenID),
		UnionID:    strings.TrimSpace(r.UnionID),
		SessionKey: strings.TrimSpace(r.SessionKey),
	}, nil
}

func maskSecret(s string) string {
	if len(s) <= 8 {
		return "***"
	}
	return s[:4] + "***" + s[len(s)-4:]
}

func maskCode(s string) string {
	if len(s) <= 6 {
		return "***"
	}
	return s[:3] + "***" + s[len(s)-3:]
}

func formatHeaders(h http.Header) string {
	var pairs []string
	for k, v := range h {
		pairs = append(pairs, fmt.Sprintf("%s=%v", k, v))
	}
	return "{" + strings.Join(pairs, ", ") + "}"
}
