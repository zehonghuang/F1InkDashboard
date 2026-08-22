package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"toinc_f1_backend/internal/config"
	"toinc_f1_backend/internal/model"
	"toinc_f1_backend/internal/teamdrivercache"

	"github.com/gin-gonic/gin"
)

type mpCrawledResultsIndex struct {
	Ok        bool                           `json:"ok"`
	Season    int                            `json:"season"`
	EventName string                         `json:"event_name"`
	EventSlug string                         `json:"event_slug"`
	CrawledAt string                         `json:"crawled_at"`
	Sessions  []mpCrawledResultsIndexSession `json:"sessions"`
}

type mpCrawledResultsIndexSession struct {
	SessionCode  string `json:"session_code"`
	SessionTitle string `json:"session_title"`
	File         string `json:"file"`
	RowCount     int    `json:"row_count"`
}

type mpCrawledSessionPayload struct {
	Ok           bool                     `json:"ok"`
	Season       int                      `json:"season"`
	EventName    string                   `json:"event_name"`
	EventSlug    string                   `json:"event_slug"`
	SessionCode  string                   `json:"session_code"`
	SessionTitle string                   `json:"session_title"`
	CrawledAt    string                   `json:"crawled_at"`
	Rows         []map[string]interface{} `json:"rows"`
}

type mpLatestCrawledSessionRow struct {
	Pos       int    `json:"pos"`
	Driver    string `json:"driver"`
	Team      string `json:"team"`
	Number    int    `json:"number"`
	Laps      string `json:"laps"`
	Time      string `json:"time"`
	Gap       string `json:"gap"`
	Interval  string `json:"interval"`
	Tyre      string `json:"tyre"`
	TeamColor string `json:"teamColor"`
	CarAccent string `json:"carAccent"`
}

// @Summary 最新 Motorsport 爬取成绩
// @Description 返回 static/assets/motorsport_results 中最新抓取的 session 成绩，并转换成小程序展示格式。
// @Tags MiniProgram
// @Produce json
// @Success 200 {object} map[string]interface{}
// @Failure 503 {object} model.ErrorResponse
// @Router /api/v1/mp/session-results/latest-crawled [get]
func MpSessionResultsLatestCrawled(cfg config.Config, tdCache *teamdrivercache.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		outputRoot := filepath.Join(strings.TrimSpace(cfg.StaticDir), "assets", "motorsport_results")
		indexPath, idx, err := findLatestMotorsportIndex(outputRoot)
		if err != nil {
			LogReqError(c, "mp_session_results_latest_crawled", "results_unavailable", err)
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "results_unavailable"})
			return
		}
		if strings.TrimSpace(indexPath) == "" || len(idx.Sessions) == 0 {
			c.JSON(http.StatusOK, gin.H{
				"ok":               true,
				"generated_at_utc": time.Now().UTC().Format(time.RFC3339Nano),
				"title":            "",
				"session_code":     "",
				"session_title":    "",
				"row_count":        0,
				"rows":             []mpLatestCrawledSessionRow{},
			})
			return
		}

		sessionMeta, sessionPath, err := findLatestMotorsportSession(filepath.Dir(indexPath), idx)
		if err != nil {
			LogReqError(c, "mp_session_results_latest_crawled", "results_unavailable", err)
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "results_unavailable"})
			return
		}
		if strings.TrimSpace(sessionPath) == "" {
			c.JSON(http.StatusOK, gin.H{
				"ok":               true,
				"generated_at_utc": time.Now().UTC().Format(time.RFC3339Nano),
				"season":           idx.Season,
				"event_name":       idx.EventName,
				"event_slug":       idx.EventSlug,
				"title":            "",
				"session_code":     "",
				"session_title":    "",
				"row_count":        0,
				"rows":             []mpLatestCrawledSessionRow{},
			})
			return
		}

		payload, err := readMotorsportSessionPayload(sessionPath)
		if err != nil {
			LogReqError(c, "mp_session_results_latest_crawled", "results_unavailable", err)
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "results_unavailable"})
			return
		}

		rows := make([]mpLatestCrawledSessionRow, 0, len(payload.Rows))
		for _, raw := range payload.Rows {
			rows = append(rows, normalizeMotorsportSessionRow(raw, tdCache))
		}
		sort.SliceStable(rows, func(i, j int) bool {
			if rows[i].Pos == rows[j].Pos {
				if rows[i].Number == rows[j].Number {
					return rows[i].Driver < rows[j].Driver
				}
				if rows[i].Number <= 0 {
					return false
				}
				if rows[j].Number <= 0 {
					return true
				}
				return rows[i].Number < rows[j].Number
			}
			if rows[i].Pos <= 0 {
				return false
			}
			if rows[j].Pos <= 0 {
				return true
			}
			return rows[i].Pos < rows[j].Pos
		})

		title := strings.TrimSpace(payload.SessionTitle)
		if title == "" {
			title = strings.TrimSpace(payload.SessionCode)
		}
		if title != "" {
			title += " Results"
		}
		shouldDisplay, hideAfterUTC := shouldDisplayLatestCrawledResults(payload)
		if !shouldDisplay {
			c.JSON(http.StatusOK, gin.H{
				"ok":                  true,
				"generated_at_utc":    time.Now().UTC().Format(time.RFC3339Nano),
				"source":              "motorsport",
				"season":              payload.Season,
				"event_name":          payload.EventName,
				"event_slug":          payload.EventSlug,
				"session_code":        payload.SessionCode,
				"session_title":       payload.SessionTitle,
				"title":               title,
				"crawled_at":          payload.CrawledAt,
				"should_display":      false,
				"hide_after_utc":      hideAfterUTC,
				"selected_file":       filepath.Base(sessionPath),
				"index_file":          filepath.Base(indexPath),
				"row_count":           0,
				"discovered_row_count": sessionMeta.RowCount,
				"rows":                []mpLatestCrawledSessionRow{},
			})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"ok":                  true,
			"generated_at_utc":    time.Now().UTC().Format(time.RFC3339Nano),
			"source":              "motorsport",
			"season":              payload.Season,
			"event_name":          payload.EventName,
			"event_slug":          payload.EventSlug,
			"session_code":        payload.SessionCode,
			"session_title":       payload.SessionTitle,
			"title":               title,
			"crawled_at":          payload.CrawledAt,
			"should_display":      shouldDisplay,
			"hide_after_utc":      hideAfterUTC,
			"selected_file":       filepath.Base(sessionPath),
			"index_file":          filepath.Base(indexPath),
			"row_count":           len(rows),
			"discovered_row_count": sessionMeta.RowCount,
			"rows":                rows,
		})
	}
}

func findLatestMotorsportIndex(outputRoot string) (string, mpCrawledResultsIndex, error) {
	var out mpCrawledResultsIndex
	entries, err := os.ReadDir(outputRoot)
	if err != nil {
		if os.IsNotExist(err) {
			return "", out, nil
		}
		return "", out, err
	}

	type candidate struct {
		path string
		mod  time.Time
	}
	var candidates []candidate
	for _, seasonEntry := range entries {
		if !seasonEntry.IsDir() {
			continue
		}
		seasonDir := filepath.Join(outputRoot, seasonEntry.Name())
		eventEntries, err := os.ReadDir(seasonDir)
		if err != nil {
			continue
		}
		for _, eventEntry := range eventEntries {
			if !eventEntry.IsDir() {
				continue
			}
			indexPath := filepath.Join(seasonDir, eventEntry.Name(), "index.json")
			info, err := os.Stat(indexPath)
			if err != nil || info.IsDir() {
				continue
			}
			candidates = append(candidates, candidate{path: indexPath, mod: info.ModTime().UTC()})
		}
	}
	if len(candidates) == 0 {
		return "", out, nil
	}
	sort.SliceStable(candidates, func(i, j int) bool {
		if candidates[i].mod.Equal(candidates[j].mod) {
			return candidates[i].path > candidates[j].path
		}
		return candidates[i].mod.After(candidates[j].mod)
	})
	for _, it := range candidates {
		var tmp mpCrawledResultsIndex
		if err := readJSONFile(it.path, &tmp); err != nil {
			continue
		}
		crawledAt, ok := parseTimeLoose(tmp.CrawledAt)
		if !ok {
			continue
		}
		if time.Now().UTC().Sub(crawledAt) > 24*time.Hour {
			continue
		}
		out = tmp
		return it.path, out, nil
	}
	return "", mpCrawledResultsIndex{}, nil
}

func findLatestMotorsportSession(eventDir string, idx mpCrawledResultsIndex) (mpCrawledResultsIndexSession, string, error) {
	var out mpCrawledResultsIndexSession
	if len(idx.Sessions) == 0 {
		return out, "", nil
	}
	type candidate struct {
		meta  mpCrawledResultsIndexSession
		path  string
		mod   time.Time
		order int
	}
	var candidates []candidate
	for i, session := range idx.Sessions {
		path := filepath.Join(eventDir, strings.TrimSpace(session.File))
		info, err := os.Stat(path)
		if err != nil || info.IsDir() {
			continue
		}
		candidates = append(candidates, candidate{
			meta:  session,
			path:  path,
			mod:   info.ModTime().UTC(),
			order: i,
		})
	}
	if len(candidates) == 0 {
		return out, "", nil
	}
	sort.SliceStable(candidates, func(i, j int) bool {
		pi := latestCrawledSessionRank(candidates[i].meta.SessionCode)
		pj := latestCrawledSessionRank(candidates[j].meta.SessionCode)
		if pi != pj {
			return pi > pj
		}
		ri := candidates[i].meta.RowCount
		rj := candidates[j].meta.RowCount
		if ri != rj {
			if ri <= 0 {
				return false
			}
			if rj <= 0 {
				return true
			}
			return ri > rj
		}
		if candidates[i].mod.Equal(candidates[j].mod) {
			return candidates[i].order > candidates[j].order
		}
		return candidates[i].mod.After(candidates[j].mod)
	})
	return candidates[0].meta, candidates[0].path, nil
}

func latestCrawledSessionRank(code string) int {
	key := strings.ToUpper(strings.ReplaceAll(strings.TrimSpace(code), "-", ""))
	switch key {
	case "FP1":
		return 110
	case "FP2":
		return 120
	case "FP3":
		return 130
	case "CSQ":
		return 240
	case "SPR", "SPRINT":
		return 248
	case "CQ", "Q":
		return 340
	case "RACE", "R":
		return 400
	}
	return 1000
}

func readMotorsportSessionPayload(path string) (mpCrawledSessionPayload, error) {
	var out mpCrawledSessionPayload
	err := readJSONFile(path, &out)
	return out, err
}

func readJSONFile(path string, dst interface{}) error {
	b, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	return json.Unmarshal(b, dst)
}

func shouldDisplayLatestCrawledResults(payload mpCrawledSessionPayload) (bool, string) {
	crawledAt, ok := parseTimeLoose(payload.CrawledAt)
	if !ok {
		return false, ""
	}
	hideAfter := crawledAt.Add(24 * time.Hour).UTC()
	return time.Now().UTC().Before(hideAfter), hideAfter.Format(time.RFC3339)
}

func parseTimeLoose(v string) (time.Time, bool) {
	s := strings.TrimSpace(v)
	if s == "" {
		return time.Time{}, false
	}
	if t, err := time.Parse(time.RFC3339Nano, s); err == nil {
		return t.UTC(), true
	}
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return t.UTC(), true
	}
	return time.Time{}, false
}

func normalizeMotorsportSessionRow(raw map[string]interface{}, tdCache *teamdrivercache.Manager) mpLatestCrawledSessionRow {
	number := parseCrawledDriverNumber(raw)
	team := normalizeMotorsportTeamName(firstNonEmptyValue(raw, "chassis", "team"))
	driver := ""
	teamColor := ""

	if tdCache != nil && number > 0 {
		if di, ok := tdCache.GetDriver(number); ok {
			driver = pickFirstNonEmpty(di.FullName, di.BroadcastName, di.NameAcronym)
			team = normalizeMotorsportTeamName(pickFirstNonEmpty(di.TeamName, team))
			teamColor = normalizeTeamColor(di.TeamColor)
		}
	}
	if tdCache != nil && team != "" && teamColor == "" {
		if ti, ok := tdCache.GetTeam(team); ok {
			teamColor = normalizeTeamColor(ti.TeamColor)
		}
	}
	if driver == "" {
		driver = simplifyMotorsportDriverName(firstNonEmptyValue(raw, "driver"), team)
	}
	timeText, gap := splitMotorsportGapAndTime(firstNonEmptyValue(raw, "time"))
	return mpLatestCrawledSessionRow{
		Pos:       toIntLoose(firstNonEmptyValue(raw, "cla", "pos", "position")),
		Driver:    driver,
		Team:      team,
		Number:    number,
		Laps:      firstNonEmptyValue(raw, "laps"),
		Time:      timeText,
		Gap:       gap,
		Interval:  firstNonEmptyValue(raw, "interval"),
		Tyre:      firstNonEmptyValue(raw, "tyres", "tyre"),
		TeamColor: teamColor,
		CarAccent: teamColor,
	}
}

func parseCrawledDriverNumber(raw map[string]interface{}) int {
	keys := []string{"unknown", "number", "no", "driver_number"}
	for _, key := range keys {
		if n := toIntLoose(firstNonEmptyValue(raw, key)); n > 0 {
			return n
		}
	}
	for key, value := range raw {
		if !strings.HasPrefix(strings.ToLower(strings.TrimSpace(key)), "unknown") {
			continue
		}
		if n := toIntLoose(value); n > 0 {
			return n
		}
	}
	return 0
}

func simplifyMotorsportDriverName(rawDriver string, team string) string {
	s := strings.TrimSpace(rawDriver)
	if s == "" {
		return ""
	}
	team = strings.TrimSpace(team)
	if team != "" {
		sLower := strings.ToLower(s)
		if strings.HasSuffix(sLower, " "+strings.ToLower(team)) {
			s = strings.TrimSpace(s[:len(s)-len(team)])
		}
	}
	parts := strings.Fields(s)
	if len(parts) >= 2 {
		return strings.Join(parts[len(parts)-2:], " ")
	}
	return s
}

func splitMotorsportGapAndTime(raw string) (string, string) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return "", ""
	}
	if !strings.HasPrefix(s, "+") {
		return s, ""
	}
	parts := strings.Fields(s)
	if len(parts) >= 2 {
		return parts[len(parts)-1], parts[0]
	}
	return s, ""
}

func firstNonEmptyValue(raw map[string]interface{}, keys ...string) string {
	for _, key := range keys {
		v := strings.TrimSpace(toStringLoose(raw[key]))
		if v != "" {
			return v
		}
	}
	return ""
}

func toStringLoose(v interface{}) string {
	switch x := v.(type) {
	case nil:
		return ""
	case string:
		return x
	case json.Number:
		return x.String()
	case float64:
		return strconv.FormatFloat(x, 'f', -1, 64)
	case float32:
		return strconv.FormatFloat(float64(x), 'f', -1, 64)
	case int:
		return strconv.Itoa(x)
	case int64:
		return strconv.FormatInt(x, 10)
	case int32:
		return strconv.FormatInt(int64(x), 10)
	default:
		return strings.TrimSpace(fmt.Sprint(v))
	}
}

func toIntLoose(v interface{}) int {
	switch x := v.(type) {
	case int:
		return x
	case int64:
		return int(x)
	case float64:
		return int(x)
	case json.Number:
		n, _ := x.Int64()
		return int(n)
	default:
		n, _ := strconv.Atoi(strings.TrimSpace(toStringLoose(v)))
		return n
	}
}

func normalizeMotorsportTeamName(s string) string {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "rb":
		return "Racing Bulls"
	case "red bull":
		return "Red Bull Racing"
	case "haas f1 team", "moneygram haas f1 team":
		return "Haas"
	default:
		return strings.TrimSpace(s)
	}
}

func pickFirstNonEmpty(values ...string) string {
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value != "" {
			return value
		}
	}
	return ""
}
