package openf1scheduler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"toinc_f1_backend/internal/config"

	"gorm.io/gorm"
)

type Scheduler struct {
	cfg config.Config
	db  *gorm.DB

	mu       sync.Mutex
	running  bool
	lastRuns map[int]time.Time
}

type sessionRow struct {
	SessionKey   int        `gorm:"column:session_key"`
	DateStartUTC time.Time  `gorm:"column:date_start_utc"`
	DateEndUTC   *time.Time `gorm:"column:date_end_utc"`
	SessionName  *string    `gorm:"column:session_name"`
	SessionType  *string    `gorm:"column:session_type"`
}

func Start(cfg config.Config, db *gorm.DB) *Scheduler {
	if db == nil {
		return nil
	}
	if !cfg.OpenF1SchedulerEnabled {
		return nil
	}
	s := &Scheduler{
		cfg:      cfg,
		db:       db,
		lastRuns: map[int]time.Time{},
	}
	go func() {
		if cfg.OpenF1SchedulerCatchUpEnabled {
			s.catchUp()
		}
		s.loop()
	}()
	return s
}

func (s *Scheduler) catchUp() {
	now := time.Now().UTC()
	limit := s.cfg.OpenF1SchedulerCatchUpLimit
	if limit <= 0 {
		limit = 20
	}
	if limit > 200 {
		limit = 200
	}

	type lastOK struct {
		DateStartUTC *time.Time `gorm:"column:date_start_utc"`
	}
	var lk lastOK
	_ = s.db.Raw(
		`
        SELECT s.date_start_utc
        FROM openf1_sync_session_status st
        JOIN openf1_sessions s ON s.session_key = st.session_key
        WHERE st.last_ok = 1 AND s.date_start_utc IS NOT NULL
        ORDER BY s.date_start_utc DESC
        LIMIT 1
    `,
	).Scan(&lk).Error

	minStart := now.AddDate(0, 0, -30)
	if lk.DateStartUTC != nil && !lk.DateStartUTC.IsZero() {
		minStart = *lk.DateStartUTC
	}

	var rows []sessionRow
	err := s.db.Raw(
		`
        SELECT s.session_key, s.date_start_utc, s.date_end_utc, s.session_name, s.session_type
        FROM openf1_sessions s
        LEFT JOIN openf1_sync_session_status st ON st.session_key = s.session_key
        WHERE s.is_cancelled IS NOT TRUE
          AND s.date_start_utc IS NOT NULL
          AND s.date_start_utc > ?
          AND s.date_end_utc IS NOT NULL
          AND s.date_end_utc < ?
          AND (st.last_ok IS NULL OR st.last_ok = 0)
        ORDER BY s.date_start_utc ASC
        LIMIT ?
    `,
		minStart, now, limit,
	).Scan(&rows).Error
	if err != nil {
		log.Printf("openf1 scheduler catchup query error: %v", err)
		return
	}
	if len(rows) == 0 {
		return
	}

	for _, r := range rows {
		log.Printf("openf1 scheduler catchup: session_key=%d", r.SessionKey)
		s.mu.Lock()
		s.running = true
		s.lastRuns[r.SessionKey] = time.Now().UTC()
		s.mu.Unlock()

		s.runOne(r)

		s.mu.Lock()
		s.running = false
		s.mu.Unlock()
	}
}

func (s *Scheduler) loop() {
	sec := s.cfg.OpenF1SchedulerIntervalSec
	if sec <= 0 {
		sec = 60
	}
	tk := time.NewTicker(time.Duration(sec) * time.Second)
	defer tk.Stop()

	s.tick()
	for range tk.C {
		s.tick()
	}
}

func (s *Scheduler) tick() {
	s.mu.Lock()
	if s.running {
		s.mu.Unlock()
		return
	}
	s.mu.Unlock()

	now := time.Now().UTC()
	interval := time.Duration(s.cfg.OpenF1SchedulerIntervalSec) * time.Second
	if interval <= 0 {
		interval = 60 * time.Second
	}
	grace := time.Duration(s.cfg.OpenF1SchedulerGraceMin) * time.Minute
	if grace < 0 {
		grace = 0
	}

	var rows []sessionRow

	endCut := now.Add(-grace)
	err := s.db.Raw(
		`
        SELECT session_key, date_start_utc, date_end_utc, session_name, session_type
        FROM openf1_sessions
        WHERE is_cancelled IS NOT TRUE
          AND date_start_utc IS NOT NULL
          AND date_start_utc <= ?
          AND (date_end_utc IS NULL OR date_end_utc >= ?)
        ORDER BY date_start_utc DESC
        LIMIT 16
    `,
		now, endCut,
	).Scan(&rows).Error
	if err != nil {
		log.Printf("openf1 scheduler query sessions error: %v", err)
		return
	}
	if len(rows) == 0 {
		return
	}

	var pick *sessionRow
	s.mu.Lock()
	bestAge := time.Duration(-1)
	for i := range rows {
		sk := rows[i].SessionKey
		last, ok := s.lastRuns[sk]
		if ok && now.Sub(last) < interval {
			continue
		}
		age := time.Duration(1 << 62)
		if ok {
			age = now.Sub(last)
		}
		if age > bestAge {
			bestAge = age
			pick = &rows[i]
		}
	}
	if pick == nil {
		s.mu.Unlock()
		return
	}
	s.running = true
	s.lastRuns[pick.SessionKey] = now
	s.mu.Unlock()

	go func(it sessionRow) {
		defer func() {
			s.mu.Lock()
			s.running = false
			s.mu.Unlock()
		}()
		s.runOne(it)
	}(*pick)
}

func (s *Scheduler) resolveScriptPath() (string, error) {
	p := s.cfg.OpenF1SchedulerScript
	if filepath.IsAbs(p) {
		if _, err := os.Stat(p); err == nil {
			return p, nil
		}
		return "", fmt.Errorf("script_not_found: %s", p)
	}
	cwd, _ := os.Getwd()
	try := []string{
		filepath.Join(cwd, p),
		filepath.Join(cwd, "backend", p),
	}
	for _, t := range try {
		if _, err := os.Stat(t); err == nil {
			return t, nil
		}
	}
	return "", fmt.Errorf("script_not_found: %s", p)
}

func (s *Scheduler) runOne(r sessionRow) {
	scriptPath, err := s.resolveScriptPath()
	if err != nil {
		log.Printf("openf1 scheduler: %v", err)
		return
	}

	startedAt := time.Now().UTC()
	runID := int64(0)
	if err := s.db.Exec(
		"INSERT INTO openf1_sync_runs (session_key, started_at_utc, ok) VALUES (?,?,0)",
		r.SessionKey,
		startedAt,
	).Error; err == nil {
		_ = s.db.Raw("SELECT LAST_INSERT_ID()").Scan(&runID).Error
	} else {
		log.Printf("openf1 scheduler sync_runs insert error: %v", err)
	}

	args := []string{
		scriptPath,
		"--session-key", fmt.Sprintf("%d", r.SessionKey),
		"--max-req-per-second", fmt.Sprintf("%d", s.cfg.OpenF1SchedulerMaxReqPerSec),
		"--max-req-per-minute", fmt.Sprintf("%d", s.cfg.OpenF1SchedulerMaxReqPerMin),
		"--summary-json",
	}
	if s.cfg.OpenF1SchedulerQuiet {
		args = append(args, "--quiet")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()

	cmd := exec.CommandContext(ctx, s.cfg.OpenF1SchedulerPython, args...)
	cmd.Env = os.Environ()
	cmd.Dir = filepath.Dir(scriptPath)

	name := ""
	if r.SessionType != nil {
		name = *r.SessionType
	} else if r.SessionName != nil {
		name = *r.SessionName
	}

	start := time.Now()
	log.Printf("openf1 scheduler sync start: session_key=%d %s", r.SessionKey, name)
	var stdoutBuf bytes.Buffer
	var stderrBuf bytes.Buffer
	cmd.Stdout = &stdoutBuf
	cmd.Stderr = &stderrBuf
	err = cmd.Run()
	out := stdoutBuf.Bytes()
	stderrOut := strings.TrimSpace(stderrBuf.String())
	cost := time.Since(start).Truncate(time.Millisecond)

	ok := err == nil
	totalRows := 0
	totalIns := 0
	endpointsJSON := ""
	errMsg := ""
	if err != nil {
		errMsg = err.Error()
	}
	if stderrOut != "" {
		if errMsg != "" {
			errMsg = errMsg + "; " + stderrOut
		} else {
			errMsg = stderrOut
		}
	}
	if len(out) > 0 {
		endpointsJSON = strings.TrimSpace(string(out))
		var summary any
		if e := json.Unmarshal([]byte(endpointsJSON), &summary); e == nil {
			if b, e2 := json.Marshal(summary); e2 == nil {
				endpointsJSON = string(b)
			}
			v, ok2 := summary.(map[string]any)
			if !ok2 {
				goto parsedDone
			}
			if b, ok3 := v["ok"].(bool); ok3 {
				ok = b && err == nil
			}
			if m, ok3 := v["totals"].(map[string]any); ok3 {
				if n, ok3 := toInt(m["rows"]); ok3 {
					totalRows = n
				}
				if n, ok3 := toInt(m["insert_attempt"]); ok3 {
					totalIns = n
				}
			}
			if !ok && (errMsg == "" || strings.HasPrefix(errMsg, "exit status")) {
				if m, ok3 := v["endpoints"].(map[string]any); ok3 {
					for _, ev := range m {
						em, ok3 := ev.(map[string]any)
						if !ok3 {
							continue
						}
						if s, ok4 := em["error"].(string); ok4 && s != "" {
							errMsg = s
							break
						}
					}
				}
			}
		}
	parsedDone:
		if !json.Valid([]byte(endpointsJSON)) {
			endpointsJSON = ""
		}
	}
	errMsg = truncateString(errMsg, 512)

	if runID > 0 {
		_ = s.db.Exec(
			`UPDATE openf1_sync_runs
             SET finished_at_utc=?,
                 ok=?,
                 duration_ms=?,
                 total_rows=?,
                 total_insert_attempt=?,
                 endpoints_json=?,
                 error_message=?
             WHERE id=?`,
			time.Now().UTC(),
			boolToTiny(ok),
			int(cost/time.Millisecond),
			nilIfZero(totalRows),
			nilIfZero(totalIns),
			nilIfEmptyJSON(endpointsJSON),
			nilIfEmpty(errMsg),
			runID,
		).Error
	}

	successAt := any(nil)
	if ok {
		successAt = time.Now().UTC()
	}
	_ = s.db.Exec(
		`INSERT INTO openf1_sync_session_status
           (session_key, last_attempt_at_utc, last_success_at_utc, last_ok, last_duration_ms, last_total_rows, last_total_insert_attempt, last_error_message)
         VALUES (?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE
           last_attempt_at_utc=VALUES(last_attempt_at_utc),
           last_success_at_utc=COALESCE(VALUES(last_success_at_utc), last_success_at_utc),
           last_ok=VALUES(last_ok),
           last_duration_ms=VALUES(last_duration_ms),
           last_total_rows=VALUES(last_total_rows),
           last_total_insert_attempt=VALUES(last_total_insert_attempt),
           last_error_message=VALUES(last_error_message)`,
		r.SessionKey,
		time.Now().UTC(),
		successAt,
		boolToTiny(ok),
		int(cost/time.Millisecond),
		nilIfZero(totalRows),
		nilIfZero(totalIns),
		nilIfEmpty(errMsg),
	).Error

	if err != nil {
		if len(out) > 0 && !s.cfg.OpenF1SchedulerQuiet {
			log.Printf("openf1 scheduler sync error: session_key=%d %s (%v) out=%s", r.SessionKey, cost, err, string(out))
		} else {
			log.Printf("openf1 scheduler sync error: session_key=%d %s (%v) err=%s", r.SessionKey, cost, err, errMsg)
		}
		return
	}
	log.Printf("openf1 scheduler sync ok: session_key=%d %s rows=%d insert_attempt=%d", r.SessionKey, cost, totalRows, totalIns)
}

func boolToTiny(v bool) int {
	if v {
		return 1
	}
	return 0
}

func toInt(v any) (int, bool) {
	switch x := v.(type) {
	case int:
		return x, true
	case int32:
		return int(x), true
	case int64:
		return int(x), true
	case float64:
		return int(x), true
	case float32:
		return int(x), true
	default:
		return 0, false
	}
}

func nilIfZero(v int) any {
	if v == 0 {
		return nil
	}
	return v
}

func nilIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func nilIfEmptyJSON(s string) any {
	if s == "" {
		return nil
	}
	return json.RawMessage([]byte(s))
}

func truncateString(s string, max int) string {
	if max <= 0 {
		return ""
	}
	if len(s) <= max {
		return s
	}
	r := []rune(s)
	if len(r) <= max {
		return s
	}
	return string(r[len(r)-max:])
}
