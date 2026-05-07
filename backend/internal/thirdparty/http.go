package thirdparty

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
)

var httpClient = &http.Client{
	Timeout: 10 * time.Second,
}

func outgoingLogEnabled() bool {
	v := strings.TrimSpace(strings.ToLower(os.Getenv("BACKEND_LOG_OUTGOING_HTTP")))
	if v == "" {
		return true
	}
	switch v {
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	default:
		return true
	}
}

func GetJSON(ctx context.Context, url string, out any) error {
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return err
	}
	start := time.Now()
	resp, err := httpClient.Do(req)
	if err != nil {
		if outgoingLogEnabled() {
			log.Printf("out GET %s -> error %s (%v)", url, time.Since(start).Truncate(time.Millisecond), err)
		}
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		if outgoingLogEnabled() {
			log.Printf("out GET %s -> %d %s", url, resp.StatusCode, time.Since(start).Truncate(time.Millisecond))
		}
		return errors.New("bad_status")
	}
	b, err := io.ReadAll(io.LimitReader(resp.Body, 8*1024*1024))
	if err != nil {
		if outgoingLogEnabled() {
			log.Printf("out GET %s -> read_error %s (%v)", url, time.Since(start).Truncate(time.Millisecond), err)
		}
		return err
	}
	if outgoingLogEnabled() {
		log.Printf("out GET %s -> %d %dB %s", url, resp.StatusCode, len(b), time.Since(start).Truncate(time.Millisecond))
	}
	return json.Unmarshal(b, out)
}

func GetText(ctx context.Context, url string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return "", err
	}
	start := time.Now()
	resp, err := httpClient.Do(req)
	if err != nil {
		if outgoingLogEnabled() {
			log.Printf("out GET %s -> error %s (%v)", url, time.Since(start).Truncate(time.Millisecond), err)
		}
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		if outgoingLogEnabled() {
			log.Printf("out GET %s -> %d %s", url, resp.StatusCode, time.Since(start).Truncate(time.Millisecond))
		}
		return "", errors.New("bad_status")
	}
	b, err := io.ReadAll(io.LimitReader(resp.Body, 8*1024*1024))
	if err != nil {
		if outgoingLogEnabled() {
			log.Printf("out GET %s -> read_error %s (%v)", url, time.Since(start).Truncate(time.Millisecond), err)
		}
		return "", err
	}
	if outgoingLogEnabled() {
		log.Printf("out GET %s -> %d %dB %s", url, resp.StatusCode, len(b), time.Since(start).Truncate(time.Millisecond))
	}
	return string(b), nil
}
