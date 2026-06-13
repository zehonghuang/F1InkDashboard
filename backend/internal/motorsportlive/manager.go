package motorsportlive

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"toinc_f1_backend/internal/config"
	"toinc_f1_backend/internal/model"
	"toinc_f1_backend/internal/ws"

	"github.com/gorilla/websocket"
)

type CachedMessage struct {
	Seq           int64  `json:"seq"`
	MessageType   string `json:"message_type"`
	ReceivedAtUTC string `json:"received_at_utc"`
	SizeBytes     int    `json:"size_bytes"`
	Text          string `json:"text,omitempty"`
	Base64        string `json:"base64,omitempty"`
	IsJSON        bool   `json:"is_json"`
}

type Snapshot struct {
	Enabled            bool            `json:"enabled"`
	Running            bool            `json:"running"`
	Connected          bool            `json:"connected"`
	WSURL              string          `json:"ws_url"`
	Origin             string          `json:"origin"`
	RecentLimit        int             `json:"recent_limit"`
	LastConnectedAtUTC string          `json:"last_connected_at_utc,omitempty"`
	LastMessageAtUTC   string          `json:"last_message_at_utc,omitempty"`
	LastStandingsAtUTC string          `json:"last_standings_at_utc,omitempty"`
	LastError          string          `json:"last_error,omitempty"`
	Latest             *CachedMessage  `json:"latest,omitempty"`
	Recent             []CachedMessage `json:"recent"`
	LatestStandings    *LiveStandings  `json:"latest_standings,omitempty"`
}

type Manager struct {
	cfg                config.Config
	dialer             websocket.Dialer
	ctx                context.Context
	cancel             context.CancelFunc
	started            atomic.Bool
	running            atomic.Bool
	seq                atomic.Int64
	hub                *ws.Hub
	mu                 sync.RWMutex
	connected          bool
	lastConnectedAtUTC string
	lastMessageAtUTC   string
	lastStandingsAtUTC string
	lastError          string
	latest             *CachedMessage
	recent             []CachedMessage
	latestStandings    *LiveStandings
}

func New(cfg config.Config, hub *ws.Hub) *Manager {
	ctx, cancel := context.WithCancel(context.Background())
	return &Manager{
		cfg: cfg,
		dialer: websocket.Dialer{
			Proxy:             http.ProxyFromEnvironment,
			HandshakeTimeout:  15 * time.Second,
			EnableCompression: true,
		},
		ctx:    ctx,
		cancel: cancel,
		hub:    hub,
		recent: make([]CachedMessage, 0, maxInt(1, cfg.MotorsportLiveRecentLimit)),
	}
}

func (m *Manager) Start() {
	if !m.cfg.MotorsportLiveEnabled || strings.TrimSpace(m.cfg.MotorsportLiveWSURL) == "" {
		return
	}
	if !m.started.CompareAndSwap(false, true) {
		return
	}
	m.running.Store(true)
	go m.run()
}

func (m *Manager) Stop() {
	m.running.Store(false)
	m.cancel()
}

func (m *Manager) Snapshot() Snapshot {
	m.mu.RLock()
	defer m.mu.RUnlock()

	recent := make([]CachedMessage, len(m.recent))
	copy(recent, m.recent)

	var latest *CachedMessage
	if m.latest != nil {
		cp := *m.latest
		latest = &cp
	}

	var latestStandings *LiveStandings
	if m.latestStandings != nil {
		cp := *m.latestStandings
		cp.Rows = append([]model.AdminMotorsportStandingRow(nil), m.latestStandings.Rows...)
		latestStandings = &cp
	}

	return Snapshot{
		Enabled:            m.cfg.MotorsportLiveEnabled,
		Running:            m.running.Load(),
		Connected:          m.connected,
		WSURL:              strings.TrimSpace(m.cfg.MotorsportLiveWSURL),
		Origin:             strings.TrimSpace(m.cfg.MotorsportLiveOrigin),
		RecentLimit:        maxInt(1, m.cfg.MotorsportLiveRecentLimit),
		LastConnectedAtUTC: m.lastConnectedAtUTC,
		LastMessageAtUTC:   m.lastMessageAtUTC,
		LastStandingsAtUTC: m.lastStandingsAtUTC,
		LastError:          m.lastError,
		Latest:             latest,
		Recent:             recent,
		LatestStandings:    latestStandings,
	}
}

func (m *Manager) run() {
	for {
		select {
		case <-m.ctx.Done():
			return
		default:
		}

		if err := m.connectAndRead(); err != nil {
			m.setDisconnected(err)
			log.Printf("motorsportlive reconnect after error: %v", err)
			select {
			case <-m.ctx.Done():
				return
			case <-time.After(3 * time.Second):
			}
			continue
		}
		m.setDisconnected(nil)

		select {
		case <-m.ctx.Done():
			return
		case <-time.After(200 * time.Millisecond):
		}
	}
}

func (m *Manager) connectAndRead() error {
	_jsii := http.Header{}
	_jsii.Set("Origin", strings.TrimSpace(m.cfg.MotorsportLiveOrigin))
	_jsii.Set("User-Agent", strings.TrimSpace(m.cfg.MotorsportLiveUserAgent))
	_jsii.Set("Pragma", "no-cache")
	_jsii.Set("Cache-Control", "no-cache")
	_jsii.Set("Accept-Language", "zh,en-US;q=0.9,en;q=0.8,zh-CN;q=0.7")

	conn, _, err := m.dialer.DialContext(m.ctx, strings.TrimSpace(m.cfg.MotorsportLiveWSURL), _jsii)
	if err != nil {
		return err
	}
	defer conn.Close()

	conn.SetReadLimit(2 << 20)
	conn.SetPongHandler(func(appData string) error {
		_ = conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})
	_ = conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	connectedAt := time.Now()
	rotateAfter := time.Duration(maxInt(1, m.cfg.MotorsportLiveReconnectIntervalSec)) * time.Second

	m.setConnected()
	log.Printf("motorsportlive connected ws=%s rotate_after=%s", strings.TrimSpace(m.cfg.MotorsportLiveWSURL), rotateAfter)

	for {
		if time.Since(connectedAt) >= rotateAfter {
			log.Printf("motorsportlive rotate connection after %s", rotateAfter)
			return nil
		}
		remaining := time.Until(connectedAt.Add(rotateAfter))
		readWindow := 60 * time.Second
		if remaining < readWindow {
			readWindow = remaining
		}
		if readWindow < time.Second {
			readWindow = time.Second
		}
		_ = conn.SetReadDeadline(time.Now().Add(readWindow))

		mt, payload, err := conn.ReadMessage()
		if err != nil {
			return err
		}
		m.storeMessage(mt, payload)
	}
}

func (m *Manager) setConnected() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.connected = true
	m.lastConnectedAtUTC = time.Now().UTC().Format(time.RFC3339Nano)
	m.lastError = ""
}

func (m *Manager) setDisconnected(err error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.connected = false
	if err != nil {
		m.lastError = err.Error()
		return
	}
	m.lastError = ""
}

func (m *Manager) storeMessage(mt int, payload []byte) {
	msg := CachedMessage{
		Seq:           m.seq.Add(1),
		MessageType:   wsMessageType(mt),
		ReceivedAtUTC: time.Now().UTC().Format(time.RFC3339Nano),
		SizeBytes:     len(payload),
	}

	if mt == websocket.TextMessage {
		msg.Text = string(payload)
		msg.IsJSON = json.Valid(payload)
	} else {
		msg.Base64 = base64.StdEncoding.EncodeToString(payload)
	}

	var parsed *LiveStandings
	if mt == websocket.TextMessage && msg.IsJSON {
		if standings, err := parseStandingsFromPayload(msg.Seq, payload); err == nil && standings != nil {
			parsed = standings
		}
	}

	m.mu.Lock()
	m.lastMessageAtUTC = msg.ReceivedAtUTC
	m.latest = &msg
	m.recent = append(m.recent, msg)
	limit := maxInt(1, m.cfg.MotorsportLiveRecentLimit)
	if len(m.recent) > limit {
		m.recent = append([]CachedMessage(nil), m.recent[len(m.recent)-limit:]...)
	}
	if parsed != nil {
		m.latestStandings = parsed
		m.lastStandingsAtUTC = parsed.ParsedAtUTC
	}
	m.mu.Unlock()

	if parsed != nil {
		m.broadcastStandings(parsed)
	}
}

func (m *Manager) broadcastStandings(standings *LiveStandings) {
	if m.hub == nil || standings == nil {
		return
	}
	_ = m.hub.BroadcastJSON(map[string]any{
		"type":            "standings",
		"source":          "motorsport_live",
		"received_at_utc": time.Now().UTC().Format(time.RFC3339Nano),
		"payload":         standings,
	})
}

func wsMessageType(mt int) string {
	switch mt {
	case websocket.TextMessage:
		return "text"
	case websocket.BinaryMessage:
		return "binary"
	case websocket.CloseMessage:
		return "close"
	case websocket.PingMessage:
		return "ping"
	case websocket.PongMessage:
		return "pong"
	default:
		return "unknown"
	}
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
