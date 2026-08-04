package meetingwindow

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"gorm.io/gorm"
)

type State struct {
	Enabled          bool   `json:"enabled"`
	Active           bool   `json:"active"`
	StartBeforeMin   int    `json:"start_before_min"`
	StopAfterMin     int    `json:"stop_after_min"`
	MeetingKey       int    `json:"meeting_key,omitempty"`
	MeetingName      string `json:"meeting_name,omitempty"`
	WindowStartAtUTC string `json:"window_start_at_utc,omitempty"`
	WindowEndAtUTC   string `json:"window_end_at_utc,omitempty"`
	CheckedAtUTC     string `json:"checked_at_utc,omitempty"`
	Error            string `json:"error,omitempty"`
}

type Watcher struct {
	db       *gorm.DB
	enabled  bool
	interval time.Duration

	startBefore time.Duration
	stopAfter   time.Duration

	ctx    context.Context
	cancel context.CancelFunc

	started atomic.Bool

	mu    sync.RWMutex
	state State

	ch chan State
}

func New(db *gorm.DB, enabled bool, intervalSec int, startBeforeMin int, stopAfterMin int) *Watcher {
	ctx, cancel := context.WithCancel(context.Background())
	w := &Watcher{
		db:          db,
		enabled:     enabled && db != nil,
		interval:    time.Duration(maxInt(5, intervalSec)) * time.Second,
		startBefore: time.Duration(maxInt(0, startBeforeMin)) * time.Minute,
		stopAfter:   time.Duration(maxInt(0, stopAfterMin)) * time.Minute,
		ctx:         ctx,
		cancel:      cancel,
		ch:          make(chan State, 1),
		state: State{
			Enabled:        enabled && db != nil,
			Active:         !(enabled && db != nil),
			StartBeforeMin: maxInt(0, startBeforeMin),
			StopAfterMin:   maxInt(0, stopAfterMin),
		},
	}
	return w
}

func (w *Watcher) Start() {
	if !w.started.CompareAndSwap(false, true) {
		return
	}
	_ = w.Refresh(time.Now().UTC())
	go w.loop()
}

func (w *Watcher) Stop() {
	w.cancel()
}

func (w *Watcher) C() <-chan State {
	return w.ch
}

func (w *Watcher) Snapshot() State {
	w.mu.RLock()
	defer w.mu.RUnlock()
	return w.state
}

func (w *Watcher) loop() {
	tk := time.NewTicker(w.interval)
	defer tk.Stop()
	for {
		select {
		case <-w.ctx.Done():
			return
		case <-tk.C:
			_ = w.Refresh(time.Now().UTC())
		}
	}
}

type meetingRow struct {
	MeetingKey   int        `gorm:"column:meeting_key"`
	MeetingName  *string    `gorm:"column:meeting_name"`
	OfficialName *string    `gorm:"column:meeting_official_name"`
	DateStartUTC time.Time  `gorm:"column:date_start_utc"`
	DateEndUTC   *time.Time `gorm:"column:date_end_utc"`
}

func (w *Watcher) Refresh(now time.Time) error {
	if !w.enabled {
		w.mu.Lock()
		prev := w.state
		w.state.Enabled = false
		w.state.Active = true
		w.state.StartBeforeMin = int(w.startBefore.Minutes())
		w.state.StopAfterMin = int(w.stopAfter.Minutes())
		w.state.MeetingKey = 0
		w.state.MeetingName = ""
		w.state.WindowStartAtUTC = ""
		w.state.WindowEndAtUTC = ""
		w.state.CheckedAtUTC = now.UTC().Format(time.RFC3339Nano)
		w.state.Error = ""
		next := w.state
		w.mu.Unlock()
		if changed(prev, next) {
			w.signal(next)
		}
		return nil
	}

	var row meetingRow
	err := w.db.Raw(
		`
        SELECT
          meeting_key,
          meeting_name,
          meeting_official_name,
          date_start_utc,
          date_end_utc
        FROM openf1_meetings
        WHERE is_cancelled IS NOT TRUE
          AND date_start_utc IS NOT NULL
          AND date_start_utc <= ?
          AND (date_end_utc IS NULL OR date_end_utc >= ?)
        ORDER BY date_start_utc DESC
        LIMIT 1
    `,
		now.Add(w.startBefore),
		now.Add(-w.stopAfter),
	).Scan(&row).Error

	w.mu.Lock()
	prev := w.state
	w.state.Enabled = true
	w.state.StartBeforeMin = int(w.startBefore.Minutes())
	w.state.StopAfterMin = int(w.stopAfter.Minutes())
	w.state.CheckedAtUTC = now.UTC().Format(time.RFC3339Nano)
	if err != nil {
		w.state.Error = err.Error()
		next := w.state
		w.mu.Unlock()
		if changed(prev, next) {
			w.signal(next)
		}
		return err
	}

	active := row.MeetingKey > 0
	name := strings.TrimSpace(firstNonEmpty(ptrString(row.OfficialName), ptrString(row.MeetingName)))
	if name == "" && row.MeetingKey > 0 {
		name = fmt.Sprintf("meeting-%d", row.MeetingKey)
	}

	windowStart := ""
	windowEnd := ""
	if row.MeetingKey > 0 {
		windowStart = row.DateStartUTC.Add(-w.startBefore).UTC().Format(time.RFC3339Nano)
		if row.DateEndUTC != nil {
			windowEnd = row.DateEndUTC.Add(w.stopAfter).UTC().Format(time.RFC3339Nano)
		}
	}

	w.state.Active = active
	w.state.MeetingKey = row.MeetingKey
	w.state.MeetingName = name
	w.state.WindowStartAtUTC = windowStart
	w.state.WindowEndAtUTC = windowEnd
	w.state.Error = ""
	next := w.state
	w.mu.Unlock()

	if changed(prev, next) {
		w.signal(next)
	}
	return nil
}

func (w *Watcher) signal(s State) {
	select {
	case w.ch <- s:
		return
	default:
	}
	select {
	case <-w.ch:
	default:
	}
	select {
	case w.ch <- s:
	default:
	}
}

func changed(a, b State) bool {
	if a.Enabled != b.Enabled || a.Active != b.Active || a.MeetingKey != b.MeetingKey {
		return true
	}
	if a.Error != b.Error {
		return true
	}
	return false
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

