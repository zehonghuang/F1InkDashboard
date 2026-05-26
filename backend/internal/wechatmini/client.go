package wechatmini

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
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
	q.Set("secret", c.Secret)
	q.Set("js_code", jsCode)
	q.Set("grant_type", "authorization_code")

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u+"?"+q.Encode(), nil)
	if err != nil {
		return Session{}, err
	}

	resp, err := hc.Do(req)
	if err != nil {
		return Session{}, err
	}
	defer resp.Body.Close()

	b, err := io.ReadAll(resp.Body)
	if err != nil {
		return Session{}, err
	}

	var r code2SessionResponse
	if err := json.Unmarshal(b, &r); err != nil {
		return Session{}, err
	}
	if r.ErrCode != 0 {
		return Session{}, &Code2SessionError{ErrCode: r.ErrCode, ErrMsg: r.ErrMsg}
	}
	if strings.TrimSpace(r.OpenID) == "" {
		return Session{}, fmt.Errorf("wechatmini code2session: empty openid")
	}

	return Session{
		OpenID:     strings.TrimSpace(r.OpenID),
		UnionID:    strings.TrimSpace(r.UnionID),
		SessionKey: strings.TrimSpace(r.SessionKey),
	}, nil
}

