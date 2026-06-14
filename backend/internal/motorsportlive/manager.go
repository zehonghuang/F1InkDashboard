package motorsportlive

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	neturl "net/url"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"toinc_f1_backend/internal/config"
	"toinc_f1_backend/internal/model"
	"toinc_f1_backend/internal/ws"

	"github.com/gorilla/websocket"
	"gorm.io/gorm"
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
	Enabled            bool             `json:"enabled"`
	Running            bool             `json:"running"`
	Connected          bool             `json:"connected"`
	WSURL              string           `json:"ws_url"`
	SeedWSURL          string           `json:"seed_ws_url,omitempty"`
	SeedCalibration    *SeedCalibration `json:"seed_calibration,omitempty"`
	Origin             string           `json:"origin"`
	RecentLimit        int              `json:"recent_limit"`
	ConnectBeforeMin   int              `json:"connect_before_min"`
	CurrentSessionKey  int              `json:"current_session_key,omitempty"`
	CurrentSessionName string           `json:"current_session_name,omitempty"`
	CurrentSessionCode string           `json:"current_session_code,omitempty"`
	CurrentStartAtUTC  string           `json:"current_start_at_utc,omitempty"`
	CurrentEndAtUTC    string           `json:"current_end_at_utc,omitempty"`
	LastConnectedAtUTC string           `json:"last_connected_at_utc,omitempty"`
	LastMessageAtUTC   string           `json:"last_message_at_utc,omitempty"`
	LastStandingsAtUTC string           `json:"last_standings_at_utc,omitempty"`
	LastError          string           `json:"last_error,omitempty"`
	Latest             *CachedMessage   `json:"latest,omitempty"`
	Recent             []CachedMessage  `json:"recent"`
	LatestStandings    *LiveStandings   `json:"latest_standings,omitempty"`
}

type Manager struct {
	cfg                config.Config
	db                 *gorm.DB
	dialer             websocket.Dialer
	ctx                context.Context
	cancel             context.CancelFunc
	started            atomic.Bool
	running            atomic.Bool
	seq                atomic.Int64
	hub                *ws.Hub
	mu                 sync.RWMutex
	connected          bool
	activeWSURL        string
	currentSessionKey  int
	currentSessionName string
	currentSessionCode string
	currentStartAtUTC  string
	currentEndAtUTC    string
	lastConnectedAtUTC string
	lastMessageAtUTC   string
	lastStandingsAtUTC string
	lastError          string
	seedCalibration    *SeedCalibration
	latest             *CachedMessage
	recent             []CachedMessage
	latestStandings    *LiveStandings
}

type scheduleRow struct {
	SessionKey       int        `gorm:"column:session_key"`
	Year             int        `gorm:"column:year"`
	MeetingKey       int        `gorm:"column:meeting_key"`
	MeetingName      *string    `gorm:"column:meeting_name"`
	Location         *string    `gorm:"column:location"`
	CountryName      *string    `gorm:"column:country_name"`
	CircuitShortName *string    `gorm:"column:circuit_short_name"`
	DateStartUTC     time.Time  `gorm:"column:date_start_utc"`
	DateEndUTC       *time.Time `gorm:"column:date_end_utc"`
	SessionName      *string    `gorm:"column:session_name"`
	SessionType      *string    `gorm:"column:session_type"`
}

type liveTarget struct {
	SessionKey   int
	SessionName  string
	SessionCode  string
	DateStartUTC time.Time
	DateEndUTC   time.Time
	WSURL        string
}

type SeedCalibration struct {
	SeedID                 int    `json:"seed_id"`
	Season                 int    `json:"season"`
	EventLabel             string `json:"event_label"`
	SessionCode            string `json:"session_code"`
	SessionName            string `json:"session_name"`
	AnchorSessionKey       int    `json:"anchor_session_key,omitempty"`
	ExpectedMeetingPattern string `json:"expected_meeting_pattern,omitempty"`
	ExpectedLocation       string `json:"expected_location,omitempty"`
	ExpectedCountry        string `json:"expected_country,omitempty"`
	MatchedSessionKey      int    `json:"matched_session_key,omitempty"`
	MatchedMeetingKey      int    `json:"matched_meeting_key,omitempty"`
	MatchedSessionName     string `json:"matched_session_name,omitempty"`
	MatchedStartAtUTC      string `json:"matched_start_at_utc,omitempty"`
	Note                   string `json:"note,omitempty"`
}

func New(cfg config.Config, db *gorm.DB, hub *ws.Hub) *Manager {
	ctx, cancel := context.WithCancel(context.Background())
	return &Manager{
		cfg: cfg,
		db:  db,
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

	var seedCalibration *SeedCalibration
	if m.seedCalibration != nil {
		cp := *m.seedCalibration
		seedCalibration = &cp
	}

	return Snapshot{
		Enabled:            m.cfg.MotorsportLiveEnabled,
		Running:            m.running.Load(),
		Connected:          m.connected,
		WSURL:              firstNonEmptyLocal(m.activeWSURL, strings.TrimSpace(m.cfg.MotorsportLiveWSURL)),
		SeedWSURL:          strings.TrimSpace(m.cfg.MotorsportLiveWSURL),
		SeedCalibration:    seedCalibration,
		Origin:             strings.TrimSpace(m.cfg.MotorsportLiveOrigin),
		RecentLimit:        maxInt(1, m.cfg.MotorsportLiveRecentLimit),
		ConnectBeforeMin:   maxInt(1, m.cfg.MotorsportLiveConnectBeforeMin),
		CurrentSessionKey:  m.currentSessionKey,
		CurrentSessionName: m.currentSessionName,
		CurrentSessionCode: m.currentSessionCode,
		CurrentStartAtUTC:  m.currentStartAtUTC,
		CurrentEndAtUTC:    m.currentEndAtUTC,
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

		target, err := m.resolveActiveTarget(time.Now().UTC())
		if err != nil {
			m.setIdle(err)
			log.Printf("motorsportlive resolve target error: %v", err)
			select {
			case <-m.ctx.Done():
				return
			case <-time.After(15 * time.Second):
			}
			continue
		}
		if target == nil {
			m.setIdle(nil)
			select {
			case <-m.ctx.Done():
				return
			case <-time.After(15 * time.Second):
			}
			continue
		}

		if err := m.connectAndRead(target); err != nil {
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

func (m *Manager) connectAndRead(target *liveTarget) error {
	_jsii := http.Header{}
	_jsii.Set("Origin", strings.TrimSpace(m.cfg.MotorsportLiveOrigin))
	_jsii.Set("User-Agent", strings.TrimSpace(m.cfg.MotorsportLiveUserAgent))
	_jsii.Set("Pragma", "no-cache")
	_jsii.Set("Cache-Control", "no-cache")
	_jsii.Set("Accept-Language", "zh,en-US;q=0.9,en;q=0.8,zh-CN;q=0.7")

	conn, _, err := m.dialer.DialContext(m.ctx, target.WSURL, _jsii)
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

	m.setConnected(target)
	log.Printf(
		"motorsportlive connected ws=%s session_key=%d session=%s rotate_after=%s",
		target.WSURL,
		target.SessionKey,
		target.SessionName,
		rotateAfter,
	)

	for {
		now := time.Now().UTC()
		if now.After(target.DateEndUTC) {
			log.Printf("motorsportlive stop after session end: session_key=%d", target.SessionKey)
			return nil
		}
		if time.Since(connectedAt) >= rotateAfter {
			log.Printf("motorsportlive rotate connection after %s", rotateAfter)
			return nil
		}
		remaining := time.Until(connectedAt.Add(rotateAfter))
		untilEnd := time.Until(target.DateEndUTC)
		readWindow := 60 * time.Second
		if now.Before(target.DateStartUTC) {
			readWindow = 5 * time.Minute
		}
		if remaining < readWindow {
			readWindow = remaining
		}
		if untilEnd < readWindow {
			readWindow = untilEnd
		}
		if readWindow < time.Second {
			readWindow = time.Second
		}
		_ = conn.SetReadDeadline(time.Now().Add(readWindow))

		mt, payload, err := conn.ReadMessage()
		if err != nil {
			if time.Now().UTC().After(target.DateEndUTC) {
				return nil
			}
			return err
		}
		m.storeMessage(mt, payload)
	}
}

func (m *Manager) setConnected(target *liveTarget) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.connected = true
	m.activeWSURL = ""
	m.currentSessionKey = 0
	m.currentSessionName = ""
	m.currentSessionCode = ""
	m.currentStartAtUTC = ""
	m.currentEndAtUTC = ""
	if target != nil {
		m.activeWSURL = target.WSURL
		m.currentSessionKey = target.SessionKey
		m.currentSessionName = target.SessionName
		m.currentSessionCode = target.SessionCode
		m.currentStartAtUTC = target.DateStartUTC.UTC().Format(time.RFC3339Nano)
		m.currentEndAtUTC = target.DateEndUTC.UTC().Format(time.RFC3339Nano)
	}
	m.lastConnectedAtUTC = time.Now().UTC().Format(time.RFC3339Nano)
	m.lastError = ""
}

func (m *Manager) setDisconnected(err error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.connected = false
	m.activeWSURL = ""
	if err != nil {
		m.lastError = err.Error()
		return
	}
	m.lastError = ""
}

func (m *Manager) setIdle(err error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.connected = false
	m.activeWSURL = ""
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

func (m *Manager) resolveActiveTarget(now time.Time) (*liveTarget, error) {
	seedURL := strings.TrimSpace(m.cfg.MotorsportLiveWSURL)
	seedID, err := extractLiveTimingID(seedURL)
	if err != nil {
		return nil, err
	}
	if m.db == nil {
		return &liveTarget{
			SessionName:  "seed-static",
			SessionCode:  "STATIC",
			DateStartUTC: now,
			DateEndUTC:   now.Add(24 * time.Hour),
			WSURL:        seedURL,
		}, nil
	}

	rows, err := m.loadScheduleRows(now)
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		m.updateSeedCalibration(baseSeedCalibration(seedID))
		return nil, nil
	}

	before := time.Duration(maxInt(1, m.cfg.MotorsportLiveConnectBeforeMin)) * time.Minute
	calibration, anchorIndex := findSeedCalibration(seedID, rows)
	m.updateSeedCalibration(calibration)
	if anchorIndex < 0 {
		anchorIndex = selectAnchorRow(rows, now, before)
	}
	if anchorIndex < 0 {
		return nil, nil
	}
	targetIndex := selectTargetRow(rows, now, before)
	if targetIndex < 0 {
		return nil, nil
	}

	targetRow := rows[targetIndex]
	targetID := seedID + (targetIndex - anchorIndex)
	if targetID <= 0 {
		return nil, fmt.Errorf("invalid_live_timing_id: %d", targetID)
	}
	targetURL, err := rewriteLiveTimingID(seedURL, targetID)
	if err != nil {
		return nil, err
	}
	sessionName := strings.TrimSpace(firstNonEmptyLocal(ptrString(targetRow.SessionType), ptrString(targetRow.SessionName)))
	if sessionName == "" {
		sessionName = fmt.Sprintf("session-%d", targetRow.SessionKey)
	}
	return &liveTarget{
		SessionKey:   targetRow.SessionKey,
		SessionName:  sessionName,
		SessionCode:  normalizeSessionCode(targetRow.SessionName, targetRow.SessionType),
		DateStartUTC: targetRow.DateStartUTC.UTC(),
		DateEndUTC:   sessionEndUTC(targetRow).UTC(),
		WSURL:        targetURL,
	}, nil
}

func (m *Manager) loadScheduleRows(now time.Time) ([]scheduleRow, error) {
	lookback := 48 * time.Hour
	lookahead := 14 * 24 * time.Hour
	var rows []scheduleRow
	err := m.db.Raw(
		`
        SELECT
          s.session_key,
          s.year,
          s.meeting_key,
          COALESCE(m.meeting_name, s.location) AS meeting_name,
          COALESCE(m.location, s.location) AS location,
          COALESCE(m.country_name, s.country_name) AS country_name,
          COALESCE(m.circuit_short_name, s.circuit_short_name) AS circuit_short_name,
          s.date_start_utc,
          s.date_end_utc,
          s.session_name,
          s.session_type
        FROM openf1_sessions s
        LEFT JOIN openf1_meetings m ON m.meeting_key = s.meeting_key
        WHERE s.is_cancelled IS NOT TRUE
          AND s.date_start_utc IS NOT NULL
          AND s.date_start_utc >= ?
          AND s.date_start_utc <= ?
        ORDER BY s.date_start_utc ASC
        LIMIT 64
    `,
		now.Add(-lookback),
		now.Add(lookahead),
	).Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	return rows, nil
}

func (m *Manager) updateSeedCalibration(cal *SeedCalibration) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if cal == nil {
		m.seedCalibration = nil
		return
	}
	cp := *cal
	m.seedCalibration = &cp
}

func baseSeedCalibration(seedID int) *SeedCalibration {
	if seedID != 782179 {
		return &SeedCalibration{
			SeedID: seedID,
			Note:   "no explicit calibration recorded for this seed id",
		}
	}
	return &SeedCalibration{
		SeedID:           782179,
		Season:           2026,
		EventLabel:       "Spanish Grand Prix",
		SessionCode:      "Q",
		SessionName:      "Qualifying",
		AnchorSessionKey: 11303,
		Note:             "seed 782179 is calibrated to session_key 11303; adjacent sessions map by +1 / -1 in schedule order",
	}
}

func findSeedCalibration(seedID int, rows []scheduleRow) (*SeedCalibration, int) {
	cal := baseSeedCalibration(seedID)
	if cal == nil {
		return nil, -1
	}
	if seedID != 782179 {
		return cal, -1
	}
	for index, row := range rows {
		if row.SessionKey != cal.AnchorSessionKey {
			continue
		}
		cal.MatchedSessionKey = row.SessionKey
		cal.MatchedMeetingKey = row.MeetingKey
		cal.MatchedSessionName = firstNonEmptyLocal(ptrString(row.SessionType), ptrString(row.SessionName))
		cal.MatchedStartAtUTC = row.DateStartUTC.UTC().Format(time.RFC3339Nano)
		return cal, index
	}
	return cal, -1
}

func selectAnchorRow(rows []scheduleRow, now time.Time, before time.Duration) int {
	currentIndex := -1
	upcomingIndex := -1
	latestPastIndex := -1
	for index, row := range rows {
		startUTC := row.DateStartUTC.UTC()
		endUTC := sessionEndUTC(row).UTC()
		if !now.Before(startUTC) && now.Before(endUTC) {
			currentIndex = index
		}
		if upcomingIndex < 0 && now.Before(startUTC) && !now.Before(startUTC.Add(-before)) {
			upcomingIndex = index
		}
		if !now.Before(startUTC) {
			latestPastIndex = index
		}
	}
	switch {
	case currentIndex >= 0:
		return currentIndex
	case upcomingIndex >= 0:
		return upcomingIndex
	case latestPastIndex >= 0:
		return latestPastIndex
	case len(rows) > 0:
		return 0
	default:
		return -1
	}
}

func selectTargetRow(rows []scheduleRow, now time.Time, before time.Duration) int {
	currentIndex := -1
	upcomingIndex := -1
	for index, row := range rows {
		startUTC := row.DateStartUTC.UTC()
		endUTC := sessionEndUTC(row).UTC()
		if !now.Before(startUTC) && now.Before(endUTC) {
			currentIndex = index
		}
		if upcomingIndex < 0 && now.Before(startUTC) && !now.Before(startUTC.Add(-before)) {
			upcomingIndex = index
		}
	}
	if currentIndex >= 0 {
		return currentIndex
	}
	if upcomingIndex >= 0 {
		return upcomingIndex
	}
	return -1
}

func sessionEndUTC(row scheduleRow) time.Time {
	if row.DateEndUTC != nil && !row.DateEndUTC.IsZero() {
		return row.DateEndUTC.UTC()
	}
	return row.DateStartUTC.UTC().Add(defaultSessionDuration(normalizeSessionCode(row.SessionName, row.SessionType)))
}

func normalizeSessionCode(name, typ *string) string {
	mapOne := func(value string) string {
		s := strings.TrimSpace(strings.ToLower(value))
		switch {
		case s == "fp1" || s == "p1" || strings.Contains(s, "practice 1"):
			return "FP1"
		case s == "fp2" || s == "p2" || strings.Contains(s, "practice 2"):
			return "FP2"
		case s == "fp3" || s == "p3" || strings.Contains(s, "practice 3"):
			return "FP3"
		case strings.Contains(s, "sprint shootout") || strings.Contains(s, "sprint qualifying"):
			return "SQ"
		case s == "sprint":
			return "SPRINT"
		case s == "qualifying":
			return "Q"
		case s == "race":
			return "RACE"
		default:
			return ""
		}
	}
	if typ != nil {
		if out := mapOne(*typ); out != "" {
			return out
		}
	}
	if name != nil {
		if out := mapOne(*name); out != "" {
			return out
		}
	}
	return ""
}

func defaultSessionDuration(code string) time.Duration {
	switch strings.ToUpper(strings.TrimSpace(code)) {
	case "FP1", "FP2", "FP3", "SPRINT", "Q":
		return 60 * time.Minute
	case "SQ":
		return 45 * time.Minute
	case "RACE":
		return 2 * time.Hour
	default:
		return 90 * time.Minute
	}
}

func extractLiveTimingID(raw string) (int, error) {
	u, err := neturl.Parse(strings.TrimSpace(raw))
	if err != nil {
		return 0, err
	}
	path := strings.Trim(strings.TrimSpace(u.Path), "/")
	if path == "" {
		return 0, fmt.Errorf("invalid_motorsport_live_ws_url")
	}
	dash := strings.Index(path, "-")
	if dash <= 0 {
		return 0, fmt.Errorf("invalid_motorsport_live_ws_path: %s", path)
	}
	var id int
	if _, err := fmt.Sscanf(path[:dash], "%d", &id); err != nil || id <= 0 {
		return 0, fmt.Errorf("invalid_motorsport_live_id: %s", path[:dash])
	}
	return id, nil
}

func rewriteLiveTimingID(raw string, nextID int) (string, error) {
	u, err := neturl.Parse(strings.TrimSpace(raw))
	if err != nil {
		return "", err
	}
	hadTrailingSlash := strings.HasSuffix(u.Path, "/")
	path := strings.Trim(strings.TrimSpace(u.Path), "/")
	dash := strings.Index(path, "-")
	if dash <= 0 {
		return "", fmt.Errorf("invalid_motorsport_live_ws_path: %s", path)
	}
	suffix := path[dash:]
	u.Path = fmt.Sprintf("/%d%s", nextID, suffix)
	if hadTrailingSlash {
		u.Path += "/"
	}
	return u.String(), nil
}

func ptrString(v *string) string {
	if v == nil {
		return ""
	}
	return strings.TrimSpace(*v)
}

func firstNonEmptyLocal(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
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
