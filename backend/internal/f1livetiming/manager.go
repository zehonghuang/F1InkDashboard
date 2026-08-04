package f1livetiming

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"toinc_f1_backend/internal/config"
	"toinc_f1_backend/internal/ws"

	"gorm.io/gorm"
)

const liveTimingQuery = `query {
  f1LiveTimingClock {
    paused
    systemTime
    trackTime
    liveTimingStartTime
  }
  f1LiveTimingState {
    SessionInfo
    SessionStatus
    TimingData
    TimingAppData
    CarData
    DriverList
    TrackStatus
    WeatherData
    RaceControlMessages
  }
}`

type Snapshot struct {
	Enabled             bool                 `json:"enabled"`
	Running             bool                 `json:"running"`
	Connected           bool                 `json:"connected"`
	Endpoint            string               `json:"endpoint"`
	PollIntervalMS      int                  `json:"poll_interval_ms"`
	RequestTimeoutMS    int                  `json:"request_timeout_ms"`
	ScheduleEnabled     bool                 `json:"schedule_enabled"`
	ScheduleActive      bool                 `json:"schedule_active"`
	ScheduleStartBefore int                  `json:"schedule_start_before_min"`
	ScheduleStopAfter   int                  `json:"schedule_stop_after_min"`
	ScheduleMeetingKey  int                  `json:"schedule_meeting_key,omitempty"`
	ScheduleMeetingName string               `json:"schedule_meeting_name,omitempty"`
	ScheduleWindowStart string               `json:"schedule_window_start_utc,omitempty"`
	ScheduleWindowEnd   string               `json:"schedule_window_end_utc,omitempty"`
	ScheduleCheckedAt   string               `json:"schedule_checked_at_utc,omitempty"`
	ScheduleError       string               `json:"schedule_error,omitempty"`
	Seq                 int64                `json:"seq"`
	LastPolledAtUTC     string               `json:"last_polled_at_utc,omitempty"`
	LastUpdatedAtUTC    string               `json:"last_updated_at_utc,omitempty"`
	LastError           string               `json:"last_error,omitempty"`
	QueryLatencyMS      int64                `json:"query_latency_ms,omitempty"`
	Clock               *Clock               `json:"clock,omitempty"`
	Session             *Session             `json:"session,omitempty"`
	TrackStatus         *TrackStatus         `json:"track_status,omitempty"`
	Weather             *Weather             `json:"weather,omitempty"`
	RaceControlMessages []RaceControlMessage `json:"race_control_messages,omitempty"`
	Rows                []StandingRow        `json:"rows"`
}

type Clock struct {
	Paused              bool   `json:"paused"`
	SystemTime          string `json:"system_time,omitempty"`
	TrackTime           string `json:"track_time,omitempty"`
	LiveTimingStartTime string `json:"live_timing_start_time,omitempty"`
}

type Session struct {
	MeetingKey    int    `json:"meeting_key,omitempty"`
	MeetingName   string `json:"meeting_name,omitempty"`
	OfficialName  string `json:"official_name,omitempty"`
	Location      string `json:"location,omitempty"`
	CountryCode   string `json:"country_code,omitempty"`
	CountryName   string `json:"country_name,omitempty"`
	Circuit       string `json:"circuit,omitempty"`
	SessionKey    int    `json:"session_key,omitempty"`
	SessionType   string `json:"session_type,omitempty"`
	SessionNumber int    `json:"session_number,omitempty"`
	SessionName   string `json:"session_name,omitempty"`
	Status        string `json:"status,omitempty"`
	StartDate     string `json:"start_date,omitempty"`
	EndDate       string `json:"end_date,omitempty"`
	GMTOffset     string `json:"gmt_offset,omitempty"`
}

type TrackStatus struct {
	Code    string `json:"code,omitempty"`
	Message string `json:"message,omitempty"`
}

type Weather struct {
	AirTemp       string `json:"air_temp,omitempty"`
	TrackTemp     string `json:"track_temp,omitempty"`
	Humidity      string `json:"humidity,omitempty"`
	Pressure      string `json:"pressure,omitempty"`
	Rainfall      string `json:"rainfall,omitempty"`
	WindDirection string `json:"wind_direction,omitempty"`
	WindSpeed     string `json:"wind_speed,omitempty"`
}

type RaceControlMessage struct {
	UTC          string `json:"utc,omitempty"`
	Category     string `json:"category,omitempty"`
	Title        string `json:"title,omitempty"`
	Message      string `json:"message,omitempty"`
	Flag         string `json:"flag,omitempty"`
	Status       string `json:"status,omitempty"`
	Mode         string `json:"mode,omitempty"`
	Scope        string `json:"scope,omitempty"`
	Sector       int    `json:"sector,omitempty"`
	RacingNumber string `json:"racing_number,omitempty"`
}

type StandingRow struct {
	Position            int          `json:"position"`
	Line                int          `json:"line,omitempty"`
	RacingNumber        string       `json:"racing_number,omitempty"`
	TLA                 string       `json:"tla,omitempty"`
	Driver              string       `json:"driver"`
	Team                string       `json:"team,omitempty"`
	TeamColor           string       `json:"team_color,omitempty"`
	Interval            string       `json:"interval,omitempty"`
	Gap                 string       `json:"gap,omitempty"`
	BestLap             string       `json:"best_lap,omitempty"`
	LastLap             string       `json:"last_lap,omitempty"`
	Tyre                string       `json:"tyre,omitempty"`
	TyreAgeLaps         int          `json:"tyre_age_laps,omitempty"`
	IsNewTyre           bool         `json:"is_new_tyre,omitempty"`
	Laps                int          `json:"laps,omitempty"`
	PitCount            int          `json:"pit_count,omitempty"`
	InPit               bool         `json:"in_pit,omitempty"`
	PitOut              bool         `json:"pit_out,omitempty"`
	Stopped             bool         `json:"stopped,omitempty"`
	Retired             bool         `json:"retired,omitempty"`
	KnockedOut          bool         `json:"knocked_out,omitempty"`
	TakenChequered      bool         `json:"taken_chequered,omitempty"`
	ShowPosition        bool         `json:"show_position"`
	StatusCode          int          `json:"status_code,omitempty"`
	Sectors             []string     `json:"sectors,omitempty"`
	SectorColors        []string     `json:"sector_colors,omitempty"`
	SectorSegmentColors [][]string   `json:"sector_segment_colors,omitempty"`
	CurrentLapFastest   bool         `json:"current_lap_fastest,omitempty"`
	PersonalBestLap     bool         `json:"personal_best_lap,omitempty"`
	CarData             *LiveCarData `json:"car_data,omitempty"`
}

type LiveCarData struct {
	UpdatedAtUTC string `json:"updated_at_utc,omitempty"`
	RPM          int    `json:"rpm,omitempty"`
	Speed        int    `json:"speed,omitempty"`
	Gear         int    `json:"gear,omitempty"`
	Throttle     int    `json:"throttle,omitempty"`
	Brake        int    `json:"brake,omitempty"`
}

type Manager struct {
	cfg            config.Config
	db             *gorm.DB
	client         *http.Client
	ctx            context.Context
	cancel         context.CancelFunc
	started        atomic.Bool
	running        atomic.Bool
	seq            atomic.Int64
	hub            *ws.Hub
	scheduleActive atomic.Bool
	scheduleCh     chan bool
	mu             sync.RWMutex
	snapshot       Snapshot
}

type graphQLRequest struct {
	Query string `json:"query"`
}

type graphQLError struct {
	Message string `json:"message"`
}

type graphQLResponse struct {
	Data struct {
		F1LiveTimingClock ClockPayload `json:"f1LiveTimingClock"`
		F1LiveTimingState StatePayload `json:"f1LiveTimingState"`
	} `json:"data"`
	Errors []graphQLError `json:"errors"`
}

type ClockPayload struct {
	Paused              bool   `json:"paused"`
	SystemTime          string `json:"systemTime"`
	TrackTime           string `json:"trackTime"`
	LiveTimingStartTime string `json:"liveTimingStartTime"`
}

type StatePayload struct {
	SessionInfo         SessionInfoPayload         `json:"SessionInfo"`
	SessionStatus       SessionStatusPayload       `json:"SessionStatus"`
	TimingData          TimingDataPayload          `json:"TimingData"`
	TimingAppData       TimingAppDataPayload       `json:"TimingAppData"`
	CarData             CarDataPayload             `json:"CarData"`
	DriverList          map[string]DriverPayload   `json:"DriverList"`
	TrackStatus         TrackStatusPayload         `json:"TrackStatus"`
	WeatherData         WeatherPayload             `json:"WeatherData"`
	RaceControlMessages RaceControlMessagesPayload `json:"RaceControlMessages"`
}

type SessionInfoPayload struct {
	Meeting struct {
		Key          int    `json:"Key"`
		Name         string `json:"Name"`
		OfficialName string `json:"OfficialName"`
		Location     string `json:"Location"`
		Country      struct {
			Code string `json:"Code"`
			Name string `json:"Name"`
		} `json:"Country"`
		Circuit struct {
			ShortName string `json:"ShortName"`
		} `json:"Circuit"`
	} `json:"Meeting"`
	Key           int    `json:"Key"`
	Type          string `json:"Type"`
	Number        int    `json:"Number"`
	Name          string `json:"Name"`
	SessionStatus string `json:"SessionStatus"`
	StartDate     string `json:"StartDate"`
	EndDate       string `json:"EndDate"`
	GmtOffset     string `json:"GmtOffset"`
}

type SessionStatusPayload struct {
	Status string `json:"Status"`
}

type TimingDataPayload struct {
	Lines map[string]TimingLinePayload `json:"Lines"`
}

type TimingLinePayload struct {
	Line                    int    `json:"Line"`
	Position                string `json:"Position"`
	ShowPosition            bool   `json:"ShowPosition"`
	RacingNumber            string `json:"RacingNumber"`
	Retired                 bool   `json:"Retired"`
	InPit                   bool   `json:"InPit"`
	PitOut                  bool   `json:"PitOut"`
	Stopped                 bool   `json:"Stopped"`
	Status                  int    `json:"Status"`
	TimeDiffToFastest       string `json:"TimeDiffToFastest"`
	TimeDiffToPositionAhead string `json:"TimeDiffToPositionAhead"`
	GapToLeader             string `json:"GapToLeader"`
	IntervalToPositionAhead struct {
		Value    string `json:"Value"`
		Catching bool   `json:"Catching"`
	} `json:"IntervalToPositionAhead"`
	Sectors []struct {
		Value           string `json:"Value"`
		OverallFastest  bool   `json:"OverallFastest"`
		PersonalFastest bool   `json:"PersonalFastest"`
		Segments        []struct {
			Status int `json:"Status"`
		} `json:"Segments"`
	} `json:"Sectors"`
	BestLapTime struct {
		Value string `json:"Value"`
	} `json:"BestLapTime"`
	LastLapTime struct {
		Value           string `json:"Value"`
		OverallFastest  bool   `json:"OverallFastest"`
		PersonalFastest bool   `json:"PersonalFastest"`
	} `json:"LastLapTime"`
	NumberOfLaps     int `json:"NumberOfLaps"`
	NumberOfPitStops int `json:"NumberOfPitStops"`
	MVStatus         struct {
		KnockedOut     bool `json:"KnockedOut"`
		TakenChequered bool `json:"TakenChequered"`
	} `json:"MVStatus"`
}

type TimingAppDataPayload struct {
	Lines map[string]TimingAppLinePayload `json:"Lines"`
}

type TimingAppLinePayload struct {
	Line         int            `json:"Line"`
	RacingNumber string         `json:"RacingNumber"`
	Stints       []StintPayload `json:"Stints"`
}

type CarDataPayload struct {
	Entries []CarDataEntryPayload `json:"Entries"`
}

type CarDataEntryPayload struct {
	Utc  string                       `json:"Utc"`
	Cars map[string]CarDataCarPayload `json:"Cars"`
}

type CarDataCarPayload struct {
	Channels map[string]int `json:"Channels"`
}

type StintPayload struct {
	Compound  string `json:"Compound"`
	New       string `json:"New"`
	TotalLaps int    `json:"TotalLaps"`
	StartLaps int    `json:"StartLaps"`
}

type DriverPayload struct {
	RacingNumber  string `json:"RacingNumber"`
	Tla           string `json:"Tla"`
	FullName      string `json:"FullName"`
	BroadcastName string `json:"BroadcastName"`
	TeamName      string `json:"TeamName"`
	TeamColour    string `json:"TeamColour"`
}

type TrackStatusPayload struct {
	Status  string `json:"Status"`
	Message string `json:"Message"`
}

type WeatherPayload struct {
	AirTemp       string `json:"AirTemp"`
	TrackTemp     string `json:"TrackTemp"`
	Humidity      string `json:"Humidity"`
	Pressure      string `json:"Pressure"`
	Rainfall      string `json:"Rainfall"`
	WindDirection string `json:"WindDirection"`
	WindSpeed     string `json:"WindSpeed"`
}

type RaceControlMessagesPayload struct {
	Messages []RaceControlMessagePayload `json:"Messages"`
}

type RaceControlMessagePayload struct {
	Utc          string `json:"Utc"`
	Category     string `json:"Category"`
	Message      string `json:"Message"`
	Flag         string `json:"Flag"`
	Status       string `json:"Status"`
	Mode         string `json:"Mode"`
	Scope        string `json:"Scope"`
	Sector       int    `json:"Sector"`
	RacingNumber string `json:"RacingNumber"`
}

func New(cfg config.Config, db *gorm.DB, hub *ws.Hub) *Manager {
	ctx, cancel := context.WithCancel(context.Background())
	timeout := time.Duration(maxInt(cfg.F1LiveTimingRequestTimeoutMS, 2000)) * time.Millisecond
	scheduleEnabled := cfg.F1LiveTimingScheduleEnabled && db != nil
	m := &Manager{
		cfg: cfg,
		db:  db,
		client: &http.Client{
			Timeout: timeout,
		},
		ctx:        ctx,
		cancel:     cancel,
		hub:        hub,
		scheduleCh: make(chan bool, 1),
		snapshot: Snapshot{
			Enabled:             cfg.F1LiveTimingEnabled,
			Endpoint:            strings.TrimSpace(cfg.F1LiveTimingGraphQLEndpoint),
			PollIntervalMS:      maxInt(cfg.F1LiveTimingPollIntervalMS, 100),
			RequestTimeoutMS:    maxInt(cfg.F1LiveTimingRequestTimeoutMS, 2000),
			ScheduleEnabled:     scheduleEnabled,
			ScheduleActive:      !scheduleEnabled,
			ScheduleStartBefore: maxInt(0, cfg.F1LiveTimingScheduleStartBeforeMin),
			ScheduleStopAfter:   maxInt(0, cfg.F1LiveTimingScheduleStopAfterMin),
			Rows:                []StandingRow{},
		},
	}
	m.scheduleActive.Store(!scheduleEnabled)
	return m
}

func (m *Manager) Start() {
	if !m.cfg.F1LiveTimingEnabled || strings.TrimSpace(m.cfg.F1LiveTimingGraphQLEndpoint) == "" {
		return
	}
	if !m.started.CompareAndSwap(false, true) {
		return
	}
	m.running.Store(true)
	if m.cfg.F1LiveTimingScheduleEnabled && m.db != nil {
		_ = m.refreshSchedule(time.Now().UTC())
		go m.scheduleLoop()
	} else {
		m.scheduleActive.Store(true)
	}
	go m.run()
}

func (m *Manager) Stop() {
	m.running.Store(false)
	m.cancel()
}

func (m *Manager) Snapshot() Snapshot {
	m.mu.RLock()
	defer m.mu.RUnlock()

	out := m.snapshot
	out.Rows = append([]StandingRow(nil), m.snapshot.Rows...)
	out.RaceControlMessages = append([]RaceControlMessage(nil), m.snapshot.RaceControlMessages...)
	if m.snapshot.Clock != nil {
		cp := *m.snapshot.Clock
		out.Clock = &cp
	}
	if m.snapshot.Session != nil {
		cp := *m.snapshot.Session
		out.Session = &cp
	}
	if m.snapshot.TrackStatus != nil {
		cp := *m.snapshot.TrackStatus
		out.TrackStatus = &cp
	}
	if m.snapshot.Weather != nil {
		cp := *m.snapshot.Weather
		out.Weather = &cp
	}
	return out
}

func (m *Manager) run() {
	interval := time.Duration(maxInt(m.cfg.F1LiveTimingPollIntervalMS, 100)) * time.Millisecond
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	if m.scheduleActive.Load() {
		if err := m.pollOnce(); err != nil {
			log.Printf("f1livetiming initial poll error: %v", err)
		}
	}
	for {
		select {
		case <-m.ctx.Done():
			return
		case active := <-m.scheduleCh:
			if !active {
				continue
			}
			if err := m.pollOnce(); err != nil {
				log.Printf("f1livetiming poll error: %v", err)
			}
		case <-ticker.C:
			if !m.scheduleActive.Load() {
				continue
			}
			if err := m.pollOnce(); err != nil {
				log.Printf("f1livetiming poll error: %v", err)
			}
		}
	}
}

type scheduleFields struct {
	ScheduleEnabled     bool
	ScheduleActive      bool
	ScheduleStartBefore int
	ScheduleStopAfter   int
	ScheduleMeetingKey  int
	ScheduleMeetingName string
	ScheduleWindowStart string
	ScheduleWindowEnd   string
	ScheduleCheckedAt   string
	ScheduleError       string
}

func (m *Manager) currentScheduleFields() scheduleFields {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return scheduleFields{
		ScheduleEnabled:     m.snapshot.ScheduleEnabled,
		ScheduleActive:      m.snapshot.ScheduleActive,
		ScheduleStartBefore: m.snapshot.ScheduleStartBefore,
		ScheduleStopAfter:   m.snapshot.ScheduleStopAfter,
		ScheduleMeetingKey:  m.snapshot.ScheduleMeetingKey,
		ScheduleMeetingName: m.snapshot.ScheduleMeetingName,
		ScheduleWindowStart: m.snapshot.ScheduleWindowStart,
		ScheduleWindowEnd:   m.snapshot.ScheduleWindowEnd,
		ScheduleCheckedAt:   m.snapshot.ScheduleCheckedAt,
		ScheduleError:       m.snapshot.ScheduleError,
	}
}

func (m *Manager) broadcastSnapshot() {
	snap := m.Snapshot()
	_ = m.hub.BroadcastJSON(map[string]any{
		"type":   "snapshot",
		"source": "f1_live_timing",
		"status": snap,
	})
}

func (m *Manager) signalSchedule(active bool) {
	select {
	case m.scheduleCh <- active:
		return
	default:
	}
	select {
	case <-m.scheduleCh:
	default:
	}
	select {
	case m.scheduleCh <- active:
	default:
	}
}

type meetingScheduleRow struct {
	MeetingKey   int        `gorm:"column:meeting_key"`
	MeetingName  *string    `gorm:"column:meeting_name"`
	OfficialName *string    `gorm:"column:meeting_official_name"`
	DateStartUTC time.Time  `gorm:"column:date_start_utc"`
	DateEndUTC   *time.Time `gorm:"column:date_end_utc"`
	IsCancelled  *bool      `gorm:"column:is_cancelled"`
}

func (m *Manager) scheduleLoop() {
	sec := maxInt(5, m.cfg.F1LiveTimingScheduleIntervalSec)
	tk := time.NewTicker(time.Duration(sec) * time.Second)
	defer tk.Stop()
	for {
		select {
		case <-m.ctx.Done():
			return
		case <-tk.C:
			_ = m.refreshSchedule(time.Now().UTC())
		}
	}
}

func (m *Manager) refreshSchedule(now time.Time) error {
	scheduleEnabled := m.cfg.F1LiveTimingScheduleEnabled && m.db != nil
	if !scheduleEnabled {
		prev := m.scheduleActive.Load()
		if !prev {
			m.scheduleActive.Store(true)
			m.signalSchedule(true)
		}
		m.mu.Lock()
		m.snapshot.ScheduleEnabled = false
		m.snapshot.ScheduleActive = true
		m.snapshot.ScheduleStartBefore = maxInt(0, m.cfg.F1LiveTimingScheduleStartBeforeMin)
		m.snapshot.ScheduleStopAfter = maxInt(0, m.cfg.F1LiveTimingScheduleStopAfterMin)
		m.snapshot.ScheduleMeetingKey = 0
		m.snapshot.ScheduleMeetingName = ""
		m.snapshot.ScheduleWindowStart = ""
		m.snapshot.ScheduleWindowEnd = ""
		m.snapshot.ScheduleCheckedAt = now.UTC().Format(time.RFC3339Nano)
		m.snapshot.ScheduleError = ""
		m.mu.Unlock()
		return nil
	}

	before := time.Duration(maxInt(0, m.cfg.F1LiveTimingScheduleStartBeforeMin)) * time.Minute
	after := time.Duration(maxInt(0, m.cfg.F1LiveTimingScheduleStopAfterMin)) * time.Minute
	var row meetingScheduleRow
	err := m.db.Raw(
		`
        SELECT
          meeting_key,
          meeting_name,
          meeting_official_name,
          date_start_utc,
          date_end_utc,
          is_cancelled
        FROM openf1_meetings
        WHERE is_cancelled IS NOT TRUE
          AND date_start_utc IS NOT NULL
          AND date_start_utc <= ?
          AND (date_end_utc IS NULL OR date_end_utc >= ?)
        ORDER BY date_start_utc DESC
        LIMIT 1
    `,
		now.Add(before),
		now.Add(-after),
	).Scan(&row).Error
	if err != nil {
		m.mu.Lock()
		m.snapshot.ScheduleEnabled = true
		m.snapshot.ScheduleCheckedAt = now.UTC().Format(time.RFC3339Nano)
		m.snapshot.ScheduleError = err.Error()
		m.mu.Unlock()
		return err
	}

	active := row.MeetingKey > 0
	meetingName := strings.TrimSpace(firstNonEmpty(ptrString(row.OfficialName), ptrString(row.MeetingName)))
	if meetingName == "" && row.MeetingKey > 0 {
		meetingName = fmt.Sprintf("meeting-%d", row.MeetingKey)
	}
	windowStart := ""
	windowEnd := ""
	if row.MeetingKey > 0 {
		windowStart = row.DateStartUTC.Add(-before).UTC().Format(time.RFC3339Nano)
		if row.DateEndUTC != nil {
			windowEnd = row.DateEndUTC.Add(after).UTC().Format(time.RFC3339Nano)
		}
	}

	prevActive := m.scheduleActive.Load()
	if active != prevActive {
		m.scheduleActive.Store(active)
		m.signalSchedule(active)
	}

	m.mu.Lock()
	changed := m.snapshot.ScheduleActive != active ||
		m.snapshot.ScheduleMeetingKey != row.MeetingKey ||
		m.snapshot.ScheduleMeetingName != meetingName ||
		m.snapshot.ScheduleWindowStart != windowStart ||
		m.snapshot.ScheduleWindowEnd != windowEnd ||
		m.snapshot.ScheduleError != ""
	m.snapshot.ScheduleEnabled = true
	m.snapshot.ScheduleActive = active
	m.snapshot.ScheduleStartBefore = maxInt(0, m.cfg.F1LiveTimingScheduleStartBeforeMin)
	m.snapshot.ScheduleStopAfter = maxInt(0, m.cfg.F1LiveTimingScheduleStopAfterMin)
	m.snapshot.ScheduleMeetingKey = row.MeetingKey
	m.snapshot.ScheduleMeetingName = meetingName
	m.snapshot.ScheduleWindowStart = windowStart
	m.snapshot.ScheduleWindowEnd = windowEnd
	m.snapshot.ScheduleCheckedAt = now.UTC().Format(time.RFC3339Nano)
	m.snapshot.ScheduleError = ""
	if active != prevActive && !active {
		m.snapshot.Connected = false
		m.snapshot.LastError = ""
		m.snapshot.QueryLatencyMS = 0
	}
	m.mu.Unlock()

	if changed {
		m.broadcastSnapshot()
	}
	return nil
}

func (m *Manager) pollOnce() error {
	start := time.Now()
	reqBody, err := json.Marshal(graphQLRequest{Query: liveTimingQuery})
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(m.ctx, http.MethodPost, strings.TrimSpace(m.cfg.F1LiveTimingGraphQLEndpoint), bytes.NewReader(reqBody))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	res, err := m.client.Do(req)
	if err != nil {
		m.setError(err.Error(), time.Since(start))
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		err = fmt.Errorf("graphql http status %d", res.StatusCode)
		m.setError(err.Error(), time.Since(start))
		return err
	}

	var payload graphQLResponse
	if err := json.NewDecoder(res.Body).Decode(&payload); err != nil {
		m.setError(err.Error(), time.Since(start))
		return err
	}
	if len(payload.Errors) > 0 {
		msg := payload.Errors[0].Message
		if strings.TrimSpace(msg) == "" {
			msg = "graphql_error"
		}
		err = fmt.Errorf(msg)
		m.setError(msg, time.Since(start))
		return err
	}

	snap := m.buildSnapshot(payload, time.Since(start))
	m.setSnapshot(snap)
	_ = m.hub.BroadcastJSON(map[string]any{
		"type":   "snapshot",
		"source": "f1_live_timing",
		"status": snap,
	})
	return nil
}

func (m *Manager) buildSnapshot(payload graphQLResponse, latency time.Duration) Snapshot {
	sf := m.currentScheduleFields()
	state := payload.Data.F1LiveTimingState
	rows := buildRows(state.TimingData.Lines, state.TimingAppData.Lines, state.DriverList, buildLatestCarDataMap(state.CarData.Entries))
	rcMessages := buildRaceControlMessages(state.RaceControlMessages.Messages)
	seq := m.seq.Add(1)
	return Snapshot{
		Enabled:             m.cfg.F1LiveTimingEnabled,
		Running:             m.running.Load(),
		Connected:           true,
		Endpoint:            strings.TrimSpace(m.cfg.F1LiveTimingGraphQLEndpoint),
		PollIntervalMS:      maxInt(m.cfg.F1LiveTimingPollIntervalMS, 100),
		RequestTimeoutMS:    maxInt(m.cfg.F1LiveTimingRequestTimeoutMS, 2000),
		ScheduleEnabled:     sf.ScheduleEnabled,
		ScheduleActive:      sf.ScheduleActive,
		ScheduleStartBefore: sf.ScheduleStartBefore,
		ScheduleStopAfter:   sf.ScheduleStopAfter,
		ScheduleMeetingKey:  sf.ScheduleMeetingKey,
		ScheduleMeetingName: sf.ScheduleMeetingName,
		ScheduleWindowStart: sf.ScheduleWindowStart,
		ScheduleWindowEnd:   sf.ScheduleWindowEnd,
		ScheduleCheckedAt:   sf.ScheduleCheckedAt,
		ScheduleError:       sf.ScheduleError,
		Seq:                 seq,
		LastPolledAtUTC:     time.Now().UTC().Format(time.RFC3339Nano),
		LastUpdatedAtUTC:    time.Now().UTC().Format(time.RFC3339Nano),
		QueryLatencyMS:      latency.Milliseconds(),
		Clock:               buildClock(payload.Data.F1LiveTimingClock),
		Session:             buildSession(state.SessionInfo, state.SessionStatus),
		TrackStatus:         buildTrackStatus(state.TrackStatus),
		Weather:             buildWeather(state.WeatherData),
		RaceControlMessages: rcMessages,
		Rows:                rows,
	}
}

func (m *Manager) setSnapshot(snap Snapshot) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.snapshot = snap
}

func (m *Manager) setError(msg string, latency time.Duration) {
	now := time.Now().UTC().Format(time.RFC3339Nano)
	m.mu.Lock()
	defer m.mu.Unlock()
	m.snapshot.Enabled = m.cfg.F1LiveTimingEnabled
	m.snapshot.Running = m.running.Load()
	m.snapshot.Connected = false
	m.snapshot.Endpoint = strings.TrimSpace(m.cfg.F1LiveTimingGraphQLEndpoint)
	m.snapshot.PollIntervalMS = maxInt(m.cfg.F1LiveTimingPollIntervalMS, 100)
	m.snapshot.RequestTimeoutMS = maxInt(m.cfg.F1LiveTimingRequestTimeoutMS, 2000)
	m.snapshot.LastPolledAtUTC = now
	m.snapshot.LastError = msg
	m.snapshot.QueryLatencyMS = latency.Milliseconds()
}

func buildClock(src ClockPayload) *Clock {
	return &Clock{
		Paused:              src.Paused,
		SystemTime:          src.SystemTime,
		TrackTime:           src.TrackTime,
		LiveTimingStartTime: src.LiveTimingStartTime,
	}
}

func buildSession(info SessionInfoPayload, status SessionStatusPayload) *Session {
	out := &Session{
		MeetingKey:    info.Meeting.Key,
		MeetingName:   info.Meeting.Name,
		OfficialName:  info.Meeting.OfficialName,
		Location:      info.Meeting.Location,
		CountryCode:   info.Meeting.Country.Code,
		CountryName:   info.Meeting.Country.Name,
		Circuit:       info.Meeting.Circuit.ShortName,
		SessionKey:    info.Key,
		SessionType:   info.Type,
		SessionNumber: info.Number,
		SessionName:   info.Name,
		Status:        firstNonEmpty(info.SessionStatus, status.Status),
		StartDate:     info.StartDate,
		EndDate:       info.EndDate,
		GMTOffset:     info.GmtOffset,
	}
	return out
}

func buildTrackStatus(src TrackStatusPayload) *TrackStatus {
	return &TrackStatus{
		Code:    src.Status,
		Message: src.Message,
	}
}

func buildWeather(src WeatherPayload) *Weather {
	return &Weather{
		AirTemp:       src.AirTemp,
		TrackTemp:     src.TrackTemp,
		Humidity:      src.Humidity,
		Pressure:      src.Pressure,
		Rainfall:      src.Rainfall,
		WindDirection: src.WindDirection,
		WindSpeed:     src.WindSpeed,
	}
}

func buildRaceControlMessages(in []RaceControlMessagePayload) []RaceControlMessage {
	if len(in) == 0 {
		return []RaceControlMessage{}
	}
	limit := 12
	if len(in) < limit {
		limit = len(in)
	}
	out := make([]RaceControlMessage, 0, limit)
	for i := len(in) - limit; i < len(in); i++ {
		msg := in[i]
		out = append(out, RaceControlMessage{
			UTC:          msg.Utc,
			Category:     msg.Category,
			Title:        firstNonEmpty(msg.Flag, msg.Status, msg.Mode, msg.Category),
			Message:      msg.Message,
			Flag:         msg.Flag,
			Status:       msg.Status,
			Mode:         msg.Mode,
			Scope:        msg.Scope,
			Sector:       msg.Sector,
			RacingNumber: msg.RacingNumber,
		})
	}
	return out
}

func buildRows(timing map[string]TimingLinePayload, app map[string]TimingAppLinePayload, drivers map[string]DriverPayload, carDataByNumber map[string]*LiveCarData) []StandingRow {
	out := make([]StandingRow, 0, len(timing))
	for key, line := range timing {
		driver := drivers[key]
		if driver.RacingNumber == "" {
			driver = drivers[line.RacingNumber]
		}
		appLine := app[key]
		if appLine.RacingNumber == "" {
			appLine = app[line.RacingNumber]
		}
		tyre, tyreAge, isNewTyre := currentTyre(appLine.Stints)
		sectors := make([]string, 0, len(line.Sectors))
		sectorColors := make([]string, 0, len(line.Sectors))
		sectorSegmentColors := make([][]string, 0, len(line.Sectors))
		for _, sector := range line.Sectors {
			if strings.TrimSpace(sector.Value) != "" {
				sectors = append(sectors, sector.Value)
			} else {
				sectors = append(sectors, "")
			}
			sectorColors = append(sectorColors, sectorColor(sector))
			sectorSegmentColors = append(sectorSegmentColors, segmentColors(sector.Segments))
		}
		row := StandingRow{
			Position:            parseIntOrZero(line.Position),
			Line:                line.Line,
			RacingNumber:        firstNonEmpty(line.RacingNumber, driver.RacingNumber),
			TLA:                 driver.Tla,
			Driver:              displayDriver(driver),
			Team:                driver.TeamName,
			TeamColor:           normalizeColor(driver.TeamColour),
			Interval:            firstNonEmpty(line.IntervalToPositionAhead.Value, line.TimeDiffToPositionAhead),
			Gap:                 firstNonEmpty(line.GapToLeader, line.TimeDiffToFastest),
			BestLap:             line.BestLapTime.Value,
			LastLap:             line.LastLapTime.Value,
			Tyre:                tyre,
			TyreAgeLaps:         tyreAge,
			IsNewTyre:           isNewTyre,
			Laps:                line.NumberOfLaps,
			PitCount:            line.NumberOfPitStops,
			InPit:               line.InPit,
			PitOut:              line.PitOut,
			Stopped:             line.Stopped,
			Retired:             line.Retired,
			KnockedOut:          line.MVStatus.KnockedOut,
			TakenChequered:      line.MVStatus.TakenChequered,
			ShowPosition:        line.ShowPosition,
			StatusCode:          line.Status,
			Sectors:             sectors,
			SectorColors:        sectorColors,
			SectorSegmentColors: sectorSegmentColors,
			CurrentLapFastest:   line.LastLapTime.OverallFastest,
			PersonalBestLap:     line.LastLapTime.PersonalFastest,
			CarData:             cloneLiveCarData(carDataByNumber[firstNonEmpty(line.RacingNumber, driver.RacingNumber, key)]),
		}
		if row.Position == 0 {
			row.Position = row.Line
		}
		if row.Driver == "" {
			row.Driver = firstNonEmpty(driver.BroadcastName, row.RacingNumber)
		}
		out = append(out, row)
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Position != out[j].Position {
			return out[i].Position < out[j].Position
		}
		return out[i].Line < out[j].Line
	})
	return out
}

func buildLatestCarDataMap(entries []CarDataEntryPayload) map[string]*LiveCarData {
	if len(entries) == 0 {
		return map[string]*LiveCarData{}
	}
	out := make(map[string]*LiveCarData, len(entries))
	for _, entry := range entries {
		for racingNumber, car := range entry.Cars {
			if strings.TrimSpace(racingNumber) == "" {
				continue
			}
			out[racingNumber] = &LiveCarData{
				UpdatedAtUTC: entry.Utc,
				RPM:          car.Channels["0"],
				Speed:        car.Channels["2"],
				Gear:         car.Channels["3"],
				Throttle:     car.Channels["4"],
				Brake:        car.Channels["5"],
			}
		}
	}
	return out
}

func cloneLiveCarData(src *LiveCarData) *LiveCarData {
	if src == nil {
		return nil
	}
	cp := *src
	return &cp
}

func currentTyre(stints []StintPayload) (string, int, bool) {
	if len(stints) == 0 {
		return "", 0, false
	}
	last := stints[len(stints)-1]
	return last.Compound, last.TotalLaps, strings.EqualFold(strings.TrimSpace(last.New), "true")
}

func sectorColor(sector struct {
	Value           string `json:"Value"`
	OverallFastest  bool   `json:"OverallFastest"`
	PersonalFastest bool   `json:"PersonalFastest"`
	Segments        []struct {
		Status int `json:"Status"`
	} `json:"Segments"`
}) string {
	if sector.OverallFastest {
		return "purple"
	}
	if sector.PersonalFastest {
		return "green"
	}
	return ""
}

func segmentColors(segments []struct {
	Status int `json:"Status"`
}) []string {
	if len(segments) == 0 {
		return []string{}
	}
	out := make([]string, 0, len(segments))
	for _, segment := range segments {
		out = append(out, segmentColor(segment.Status))
	}
	return out
}

func segmentColor(status int) string {
	switch status {
	case 2024, 2048:
		return "yellow"
	case 2064:
		return "blue"
	case 2049:
		return "purple"
	default:
		return ""
	}
}

func displayDriver(driver DriverPayload) string {
	return firstNonEmpty(driver.BroadcastName, driver.FullName, driver.Tla, driver.RacingNumber)
}

func normalizeColor(v string) string {
	v = strings.TrimSpace(v)
	if v == "" {
		return ""
	}
	if strings.HasPrefix(v, "#") {
		return v
	}
	return "#" + v
}

func parseIntOrZero(v string) int {
	n, err := strconv.Atoi(strings.TrimSpace(v))
	if err != nil {
		return 0
	}
	return n
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func ptrString(v *string) string {
	if v == nil {
		return ""
	}
	return strings.TrimSpace(*v)
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
