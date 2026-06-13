package tasks

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"toinc_f1_backend/internal/config"

	"gorm.io/gorm"
)

type MotorsportResultsScheduler struct {
	cfg config.Config
	db  *gorm.DB

	mu       sync.Mutex
	running  bool
	executed map[string]time.Time
	delays   []int
	status   motorsportSchedulerStatus
}

type motorsportSessionRow struct {
	SessionKey   int        `gorm:"column:session_key"`
	MeetingKey   int        `gorm:"column:meeting_key"`
	Season       int        `gorm:"column:season"`
	MeetingName  string     `gorm:"column:meeting_name"`
	Location     *string    `gorm:"column:location"`
	CountryName  *string    `gorm:"column:country_name"`
	CircuitShort *string    `gorm:"column:circuit_short_name"`
	SessionName  *string    `gorm:"column:session_name"`
	SessionType  *string    `gorm:"column:session_type"`
	DateStartUTC *time.Time `gorm:"column:date_start_utc"`
}

type motorsportRunTarget struct {
	Season      int
	MeetingKey  int
	EventName   string
	EventSlug   string
	EventKey    string
	TriggeredBy []string
}

type motorsportSchedulerRunRecord struct {
	StartedAtUTC    string   `json:"started_at_utc"`
	FinishedAtUTC   string   `json:"finished_at_utc,omitempty"`
	Reason          string   `json:"reason"`
	EventName       string   `json:"event_name"`
	EventSlug       string   `json:"event_slug"`
	Season          int      `json:"season"`
	TriggeredPoints int      `json:"triggered_points"`
	WrittenSessions []string `json:"written_sessions,omitempty"`
	OK              bool     `json:"ok"`
	Error           string   `json:"error,omitempty"`
	DurationMs      int64    `json:"duration_ms"`
}

type motorsportSchedulerStatus struct {
	Enabled              bool                           `json:"enabled"`
	Running              bool                           `json:"running"`
	DelayMinutes         []int                          `json:"delay_minutes"`
	IntervalSec          int                            `json:"interval_sec"`
	LookbackHours        int                            `json:"lookback_hours"`
	StatusFile           string                         `json:"status_file"`
	OutputRoot           string                         `json:"output_root"`
	StartupRunAttempted  bool                           `json:"startup_run_attempted"`
	LastTickAtUTC        string                         `json:"last_tick_at_utc,omitempty"`
	LastReason           string                         `json:"last_reason,omitempty"`
	LastRunStartedAtUTC  string                         `json:"last_run_started_at_utc,omitempty"`
	LastRunFinishedAtUTC string                         `json:"last_run_finished_at_utc,omitempty"`
	LastSuccessAtUTC     string                         `json:"last_success_at_utc,omitempty"`
	LastError            string                         `json:"last_error,omitempty"`
	LastEventName        string                         `json:"last_event_name,omitempty"`
	CurrentEventName     string                         `json:"current_event_name,omitempty"`
	CurrentIndex         int                            `json:"current_index,omitempty"`
	TotalTargets         int                            `json:"total_targets,omitempty"`
	CompletedTargets     int                            `json:"completed_targets,omitempty"`
	RecentRuns           []motorsportSchedulerRunRecord `json:"recent_runs,omitempty"`
}

func StartMotorsportResultsScheduler(cfg config.Config, db *gorm.DB) *MotorsportResultsScheduler {
	if db == nil {
		return nil
	}
	if !cfg.MotorsportResultsSchedulerEnabled {
		return nil
	}

	delays, err := parseMotorsportDelayChain(cfg.MotorsportResultsSchedulerDelays)
	if err != nil {
		log.Printf("motorsport results scheduler disabled: bad delay chain: %v", err)
		return nil
	}

	s := &MotorsportResultsScheduler{
		cfg:      cfg,
		db:       db,
		executed: map[string]time.Time{},
		delays:   delays,
	}
	s.initStatus()
	go s.loop()
	return s
}

func (s *MotorsportResultsScheduler) loop() {
	sec := s.cfg.MotorsportResultsSchedulerIntervalSec
	if sec <= 0 {
		sec = 60
	}
	tk := time.NewTicker(time.Duration(sec) * time.Second)
	defer tk.Stop()

	s.tick("startup")
	for range tk.C {
		s.tick("interval")
	}
}

func (s *MotorsportResultsScheduler) tick(reason string) {
	s.mu.Lock()
	if s.running {
		s.status.LastTickAtUTC = time.Now().UTC().Format(time.RFC3339)
		s.status.LastReason = reason
		s.writeStatusLocked()
		s.mu.Unlock()
		return
	}
	s.running = true
	s.status.Running = true
	s.status.LastTickAtUTC = time.Now().UTC().Format(time.RFC3339)
	s.status.LastReason = reason
	if reason == "startup" {
		s.status.StartupRunAttempted = true
	}
	s.writeStatusLocked()
	s.mu.Unlock()

	go func() {
		defer func() {
			s.mu.Lock()
			s.running = false
			s.status.Running = false
			s.status.CurrentEventName = ""
			s.status.CurrentIndex = 0
			s.status.TotalTargets = 0
			s.status.CompletedTargets = 0
			s.writeStatusLocked()
			s.mu.Unlock()
		}()
		s.runOnce(reason)
	}()
}

func (s *MotorsportResultsScheduler) runOnce(reason string) {
	now := time.Now().UTC()
	targets, err := s.collectDueTargets(now)
	s.mu.Lock()
	s.status.LastRunStartedAtUTC = now.Format(time.RFC3339)
	s.status.LastRunFinishedAtUTC = ""
	s.status.TotalTargets = len(targets)
	s.status.CompletedTargets = 0
	if err != nil {
		s.status.LastError = err.Error()
		s.status.LastRunFinishedAtUTC = time.Now().UTC().Format(time.RFC3339)
		s.writeStatusLocked()
		s.mu.Unlock()
		log.Printf("motorsport results scheduler query error: %v", err)
		return
	}
	s.writeStatusLocked()
	s.mu.Unlock()
	if err != nil {
		return
	}
	if len(targets) == 0 {
		s.mu.Lock()
		s.status.LastRunFinishedAtUTC = time.Now().UTC().Format(time.RFC3339)
		s.status.LastError = ""
		s.writeStatusLocked()
		s.mu.Unlock()
		return
	}
	for index, target := range targets {
		s.mu.Lock()
		s.status.CurrentEventName = target.EventName
		s.status.CurrentIndex = index + 1
		s.writeStatusLocked()
		s.mu.Unlock()
		s.runTarget(now, reason, target)
		s.mu.Lock()
		s.status.CompletedTargets = index + 1
		s.writeStatusLocked()
		s.mu.Unlock()
	}
	s.cleanupExecuted(now)
	s.mu.Lock()
	s.status.LastRunFinishedAtUTC = time.Now().UTC().Format(time.RFC3339)
	s.writeStatusLocked()
	s.mu.Unlock()
}

func (s *MotorsportResultsScheduler) collectDueTargets(now time.Time) ([]motorsportRunTarget, error) {
	lookbackHours := s.cfg.MotorsportResultsSchedulerLookbackHours
	if lookbackHours <= 0 {
		lookbackHours = 12
	}
	windowStart := now.Add(-time.Duration(lookbackHours) * time.Hour)

	var rows []motorsportSessionRow
	err := s.db.Raw(
		`
        SELECT
          s.session_key,
          s.meeting_key,
          m.year AS season,
          m.meeting_name,
          m.location,
          m.country_name,
          m.circuit_short_name,
          s.session_name,
          s.session_type,
          s.date_start_utc
        FROM openf1_sessions s
        JOIN openf1_meetings m ON m.meeting_key = s.meeting_key
        WHERE s.is_cancelled IS NOT TRUE
          AND s.date_start_utc IS NOT NULL
          AND s.date_start_utc <= ?
          AND s.date_start_utc >= ?
        ORDER BY s.date_start_utc DESC
        LIMIT 128
    `,
		now, windowStart,
	).Scan(&rows).Error
	if err != nil {
		return nil, err
	}

	targetMap := map[int]*motorsportRunTarget{}
	for _, row := range rows {
		if row.DateStartUTC == nil {
			continue
		}
		sessionCode := normalizeMotorsportSessionCode(row.SessionName, row.SessionType)
		if sessionCode == "" {
			continue
		}
		duePoints := s.dueCheckpoints(row, sessionCode, now)
		if len(duePoints) == 0 {
			continue
		}
		eventName := strings.TrimSpace(row.MeetingName)
		if eventName == "" {
			eventName = fmt.Sprintf("meeting-%d", row.MeetingKey)
		}
		eventSlug := slugifyMotorsport(eventName)
		target, ok := targetMap[row.MeetingKey]
		if !ok {
			target = &motorsportRunTarget{
				Season:      row.Season,
				MeetingKey:  row.MeetingKey,
				EventName:   eventName,
				EventSlug:   eventSlug,
				EventKey:    eventSlug,
				TriggeredBy: []string{},
			}
			targetMap[row.MeetingKey] = target
		}
		target.TriggeredBy = append(target.TriggeredBy, duePoints...)
	}

	targets := make([]motorsportRunTarget, 0, len(targetMap))
	for _, target := range targetMap {
		targets = append(targets, *target)
	}
	return targets, nil
}

func (s *MotorsportResultsScheduler) dueCheckpoints(row motorsportSessionRow, sessionCode string, now time.Time) []string {
	if row.DateStartUTC == nil {
		return nil
	}
	startUTC := row.DateStartUTC.UTC()
	out := make([]string, 0, len(s.delays))
	for _, minute := range s.delays {
		runAt := startUTC.Add(time.Duration(minute) * time.Minute)
		if now.Before(runAt) {
			continue
		}
		jobKey := fmt.Sprintf("%d:%d:%s:%s:%d", row.Season, row.MeetingKey, sessionCode, startUTC.Format(time.RFC3339), minute)
		s.mu.Lock()
		_, done := s.executed[jobKey]
		s.mu.Unlock()
		if done {
			continue
		}
		out = append(out, jobKey)
	}
	return out
}

func (s *MotorsportResultsScheduler) runTarget(now time.Time, reason string, target motorsportRunTarget) {
	scriptPath, err := resolveMotorsportScriptPath(s.cfg.MotorsportResultsSchedulerScript)
	if err != nil {
		s.recordRun(reason, target, now, time.Now().UTC(), nil, err.Error(), false)
		log.Printf("motorsport results scheduler: %v", err)
		return
	}

	outputRoot, err := resolveMotorsportOutputRoot(s.cfg.StaticDir)
	if err != nil {
		s.recordRun(reason, target, now, time.Now().UTC(), nil, err.Error(), false)
		log.Printf("motorsport results scheduler: %v", err)
		return
	}
	args := []string{
		scriptPath,
		"--mode", "direct",
		"--season", strconv.Itoa(target.Season),
		"--event-name", target.EventName,
		"--event-slug", target.EventSlug,
		"--event-key", target.EventKey,
		"--output-root", outputRoot,
	}

	timeoutSec := s.cfg.MotorsportResultsSchedulerTimeoutSec
	if timeoutSec <= 0 {
		timeoutSec = 180
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(timeoutSec)*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, s.cfg.MotorsportResultsSchedulerPython, args...)
	cmd.Env = os.Environ()
	cmd.Dir = filepath.Dir(scriptPath)

	start := time.Now().UTC()
	log.Printf("motorsport results scheduler start: season=%d event=%s triggers=%d", target.Season, target.EventName, len(target.TriggeredBy))
	out, err := cmd.CombinedOutput()
	finishedAt := time.Now().UTC()
	cost := finishedAt.Sub(start).Truncate(time.Millisecond)

	if err != nil {
		s.recordRun(reason, target, start, finishedAt, nil, strings.TrimSpace(string(out)), false)
		if len(out) > 0 {
			log.Printf("motorsport results scheduler error: event=%s cost=%s err=%v out=%s", target.EventName, cost, err, strings.TrimSpace(string(out)))
		} else {
			log.Printf("motorsport results scheduler error: event=%s cost=%s err=%v", target.EventName, cost, err)
		}
		return
	}

	writtenSessions := []string{}
	if len(out) > 0 {
		var payload map[string]any
		if json.Unmarshal(out, &payload) == nil {
			if items, ok := payload["written_sessions"].([]any); ok {
				for _, item := range items {
					if text, ok2 := item.(string); ok2 && strings.TrimSpace(text) != "" {
						writtenSessions = append(writtenSessions, strings.TrimSpace(text))
					}
				}
			}
		}
	}

	s.mu.Lock()
	for _, jobKey := range target.TriggeredBy {
		s.executed[jobKey] = now
	}
	s.mu.Unlock()
	s.recordRun(reason, target, start, finishedAt, writtenSessions, "", true)

	if len(writtenSessions) > 0 {
		log.Printf("motorsport results scheduler ok: event=%s cost=%s sessions=%s", target.EventName, cost, strings.Join(writtenSessions, ","))
		return
	}
	if !s.cfg.MotorsportResultsSchedulerQuiet && len(out) > 0 {
		log.Printf("motorsport results scheduler ok: event=%s cost=%s out=%s", target.EventName, cost, strings.TrimSpace(string(out)))
		return
	}
	log.Printf("motorsport results scheduler ok: event=%s cost=%s", target.EventName, cost)
}

func (s *MotorsportResultsScheduler) cleanupExecuted(now time.Time) {
	keep := 48 * time.Hour
	s.mu.Lock()
	defer s.mu.Unlock()
	for key, ts := range s.executed {
		if now.Sub(ts) > keep {
			delete(s.executed, key)
		}
	}
}

func (s *MotorsportResultsScheduler) initStatus() {
	outputRoot, _ := resolveMotorsportOutputRoot(s.cfg.StaticDir)
	statusFile := ""
	if outputRoot != "" {
		statusFile = filepath.Join(outputRoot, "_scheduler_status.json")
	}
	s.status = motorsportSchedulerStatus{
		Enabled:       s.cfg.MotorsportResultsSchedulerEnabled,
		Running:       false,
		DelayMinutes:  append([]int(nil), s.delays...),
		IntervalSec:   s.cfg.MotorsportResultsSchedulerIntervalSec,
		LookbackHours: s.cfg.MotorsportResultsSchedulerLookbackHours,
		StatusFile:    statusFile,
		OutputRoot:    outputRoot,
		RecentRuns:    []motorsportSchedulerRunRecord{},
	}
	s.writeStatusLocked()
}

func (s *MotorsportResultsScheduler) recordRun(reason string, target motorsportRunTarget, startedAt, finishedAt time.Time, writtenSessions []string, errMsg string, ok bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	durationMs := finishedAt.Sub(startedAt).Milliseconds()
	record := motorsportSchedulerRunRecord{
		StartedAtUTC:    startedAt.Format(time.RFC3339),
		FinishedAtUTC:   finishedAt.Format(time.RFC3339),
		Reason:          reason,
		EventName:       target.EventName,
		EventSlug:       target.EventSlug,
		Season:          target.Season,
		TriggeredPoints: len(target.TriggeredBy),
		WrittenSessions: append([]string(nil), writtenSessions...),
		OK:              ok,
		Error:           errMsg,
		DurationMs:      durationMs,
	}
	s.status.LastEventName = target.EventName
	s.status.LastRunStartedAtUTC = startedAt.Format(time.RFC3339)
	s.status.LastRunFinishedAtUTC = finishedAt.Format(time.RFC3339)
	if ok {
		s.status.LastSuccessAtUTC = finishedAt.Format(time.RFC3339)
		s.status.LastError = ""
	} else {
		s.status.LastError = errMsg
	}
	s.status.RecentRuns = append([]motorsportSchedulerRunRecord{record}, s.status.RecentRuns...)
	if len(s.status.RecentRuns) > 10 {
		s.status.RecentRuns = s.status.RecentRuns[:10]
	}
	s.writeStatusLocked()
}

func (s *MotorsportResultsScheduler) writeStatusLocked() {
	if strings.TrimSpace(s.status.StatusFile) == "" {
		return
	}
	_ = os.MkdirAll(filepath.Dir(s.status.StatusFile), 0o755)
	payload, err := json.MarshalIndent(s.status, "", "  ")
	if err != nil {
		return
	}
	_ = os.WriteFile(s.status.StatusFile, append(payload, '\n'), 0o644)
}

func resolveMotorsportScriptPath(script string) (string, error) {
	if filepath.IsAbs(script) {
		if _, err := os.Stat(script); err == nil {
			return script, nil
		}
		return "", fmt.Errorf("script_not_found: %s", script)
	}
	cwd, _ := os.Getwd()
	try := []string{
		filepath.Join(cwd, script),
		filepath.Join(cwd, "backend", script),
	}
	for _, item := range try {
		if _, err := os.Stat(item); err == nil {
			return item, nil
		}
	}
	return "", fmt.Errorf("script_not_found: %s", script)
}

func resolveMotorsportOutputRoot(staticDir string) (string, error) {
	if filepath.IsAbs(staticDir) {
		return filepath.Join(staticDir, "assets", "motorsport_results"), nil
	}
	cwd, _ := os.Getwd()
	try := []string{
		filepath.Join(cwd, staticDir),
		filepath.Join(cwd, "backend", staticDir),
	}
	for _, item := range try {
		if st, err := os.Stat(item); err == nil && st.IsDir() {
			return filepath.Join(item, "assets", "motorsport_results"), nil
		}
	}
	return "", fmt.Errorf("static_dir_not_found: %s", staticDir)
}

func parseMotorsportDelayChain(raw string) ([]int, error) {
	parts := strings.Split(strings.TrimSpace(raw), ",")
	if len(parts) == 0 {
		return nil, fmt.Errorf("empty delay chain")
	}
	total := 0
	out := make([]int, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		n, err := strconv.Atoi(part)
		if err != nil || n <= 0 {
			return nil, fmt.Errorf("bad delay: %q", part)
		}
		total += n
		out = append(out, total)
	}
	if len(out) == 0 {
		return nil, fmt.Errorf("empty delay chain")
	}
	return out, nil
}

func normalizeMotorsportSessionCode(name, typ *string) string {
	mapOne := func(value string) string {
		s := strings.TrimSpace(strings.ToLower(value))
		switch {
		case s == "fp1" || s == "p1" || strings.Contains(s, "practice 1"):
			return "FP1"
		case s == "fp2" || s == "p2" || strings.Contains(s, "practice 2"):
			return "FP2"
		case s == "fp3" || s == "p3" || strings.Contains(s, "practice 3"):
			return "FP3"
		case s == "sprint":
			return "SPRINT"
		case strings.Contains(s, "sprint shootout") || strings.Contains(s, "sprint qualifying"):
			return "SQ"
		case s == "qualifying":
			return "Q"
		case s == "race":
			return "RACE"
		default:
			return ""
		}
	}
	if name != nil {
		if out := mapOne(*name); out != "" {
			return out
		}
	}
	if typ != nil {
		if out := mapOne(*typ); out != "" {
			return out
		}
	}
	return ""
}

var nonSlugChars = regexp.MustCompile(`[^a-z0-9]+`)

func slugifyMotorsport(value string) string {
	s := normalizeMotorsportEventLabel(value)
	s = strings.ReplaceAll(s, " ", "-")
	s = nonSlugChars.ReplaceAllString(s, "-")
	s = strings.Trim(s, "-")
	if s == "" {
		return "unknown"
	}
	return s
}

func normalizeMotorsportEventLabel(value string) string {
	s := strings.TrimSpace(strings.ToLower(value))
	replacements := []struct{ old, new string }{
		{"formula 1", " "},
		{"f1", " "},
		{"grand prix", " gp "},
		{"grand-prix", " gp "},
		{"prix", " gp "},
	}
	for _, item := range replacements {
		s = strings.ReplaceAll(s, item.old, item.new)
	}
	s = nonSlugChars.ReplaceAllString(s, " ")
	return strings.Join(strings.Fields(s), " ")
}
