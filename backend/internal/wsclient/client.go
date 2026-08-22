package wsclient

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type Client struct {
	baseURL       string
	internalToken string
	httpClient    *http.Client
}

func New(baseURL, internalToken string) *Client {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	return &Client{
		baseURL:       baseURL,
		internalToken: strings.TrimSpace(internalToken),
		httpClient: &http.Client{
			Timeout: 8 * time.Second,
		},
	}
}

func (c *Client) Enabled() bool {
	return c.baseURL != ""
}

func (c *Client) GetJSON(path string, out any) error {
	if !c.Enabled() {
		return fmt.Errorf("ws_server_unavailable")
	}
	reqURL := c.baseURL + "/" + strings.TrimLeft(path, "/")
	if c.internalToken != "" && strings.ContainsAny(reqURL, "?") {
		reqURL += "&internal_token=" + url.QueryEscape(c.internalToken)
	} else if c.internalToken != "" {
		reqURL += "?internal_token=" + url.QueryEscape(c.internalToken)
	}
	req, err := http.NewRequest(http.MethodGet, reqURL, nil)
	if err != nil {
		return err
	}
	if c.internalToken != "" {
		req.Header.Set("X-WS-Internal-Token", c.internalToken)
	}
	res, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	body, err := io.ReadAll(res.Body)
	if err != nil {
		return err
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return fmt.Errorf("ws_server status=%d body=%s", res.StatusCode, truncateBody(body, 300))
	}
	if out == nil {
		return nil
	}
	if err := json.Unmarshal(body, out); err != nil {
		return err
	}
	return nil
}

func (c *Client) PostJSON(path string, payload any, out any) error {
	if !c.Enabled() {
		return fmt.Errorf("ws_server_unavailable")
	}
	reqURL := c.baseURL + "/" + strings.TrimLeft(path, "/")
	var bodyBytes []byte
	var err error
	if payload != nil {
		bodyBytes, err = json.Marshal(payload)
		if err != nil {
			return err
		}
	}
	req, err := http.NewRequest(http.MethodPost, reqURL, bytes.NewReader(bodyBytes))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if c.internalToken != "" {
		req.Header.Set("X-WS-Internal-Token", c.internalToken)
	}
	res, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	raw, err := io.ReadAll(res.Body)
	if err != nil {
		return err
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return fmt.Errorf("ws_server status=%d body=%s", res.StatusCode, truncateBody(raw, 300))
	}
	if out == nil {
		return nil
	}
	if err := json.Unmarshal(raw, out); err != nil {
		return err
	}
	return nil
}

func truncateBody(b []byte, n int) string {
	s := string(b)
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}
