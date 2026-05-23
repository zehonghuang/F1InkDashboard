package handlers

import (
	"fmt"
	"math"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"toinc_f1_backend/internal/f1db"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func MpArchive(db *gorm.DB, staticDir string) gin.HandlerFunc {
	return func(c *gin.Context) {
		if db == nil {
			LogReqError(c, "mp_archive", "mysql_required", nil)
			c.JSON(http.StatusServiceUnavailable, gin.H{"ok": false, "error": "mysql_required"})
			return
		}

		tzName := strings.TrimSpace(c.Query("tz"))
		if tzName == "" {
			tzName = "Asia/Shanghai"
		}
		loc, err := time.LoadLocation(tzName)
		if err != nil {
			loc = time.FixedZone("UTC", 0)
		}

		nowUTC := time.Now().UTC()
		season := toIntQuery(c, "season", 2026)
		lang := strings.TrimSpace(c.GetString("language"))
		scheduleJSON, err := f1db.OpenF1ScheduleJSON(db, season, lang)
		if err != nil {
			LogReqError(c, "mp_archive", "schedule_unavailable", err)
			c.JSON(http.StatusServiceUnavailable, gin.H{"ok": false, "error": "schedule_unavailable"})
			return
		}

		races := extractScheduleRaces(scheduleJSON)
		if races == nil {
			LogReqError(c, "mp_archive", "schedule_unavailable", nil)
			c.JSON(http.StatusServiceUnavailable, gin.H{"ok": false, "error": "schedule_unavailable"})
			return
		}

		assetsByRound := map[int]map[string]any{}
		assetsByDate := map[string]map[string]any{}
		assetsByRaceName := map[string]map[string]any{}
		assetsJSON, err := f1db.CircuitAssetsPayloadFromDB(db, season, lang)
		if (err != nil || assetsJSON == nil) && staticDir != "" {
			if v, ok := loadCircuitAssetsFromDisk(staticDir, season); ok {
				assetsJSON = v
			}
		}
		if assetsJSON != nil {
			if items, ok := assetsJSON["items"].([]any); ok {
				for _, it := range items {
					m, ok := it.(map[string]any)
					if !ok || m == nil {
						continue
					}
					round, ok := anyToInt(m["round"])
					if !ok || round <= 0 {
						continue
					}
					assetsByRound[round] = m
					dateISO := strings.TrimSpace(fmt.Sprintf("%v", m["date"]))
					if len(dateISO) >= 10 {
						dateISO = dateISO[:10]
					}
					if dateISO != "" && dateISO != "<nil>" {
						assetsByDate[dateISO] = m
					}
					rn := strings.TrimSpace(strings.ToLower(fmt.Sprintf("%v", m["race_name"])))
					if rn != "" && rn != "<nil>" {
						assetsByRaceName[rn] = m
					}
				}
			}
		}

		sessionKeys := make([]int, 0, len(races))
		sessionKeyByRound := map[int]int{}
		for _, r := range races {
			round, ok := anyToInt(r["round"])
			if !ok || round <= 0 {
				continue
			}
			sk, ok := anyToInt(r["openf1_race_session_key"])
			if !ok || sk <= 0 {
				continue
			}
			sessionKeyByRound[round] = sk
			sessionKeys = append(sessionKeys, sk)
		}
		sessionKeys = uniqIntsLocal(sessionKeys)

		startBySessionKey := map[int]time.Time{}
		if len(sessionKeys) > 0 {
			type sessRow struct {
				SessionKey   int       `gorm:"column:session_key"`
				DateStartUTC time.Time `gorm:"column:date_start_utc"`
			}
			var sess []sessRow
			_ = db.Raw(`
				SELECT session_key, date_start_utc
				FROM openf1_sessions
				WHERE session_key IN (?)
			`, sessionKeys).Scan(&sess).Error
			for _, it := range sess {
				if !it.DateStartUTC.IsZero() {
					startBySessionKey[it.SessionKey] = it.DateStartUTC.UTC()
				}
			}
		}

		winnerBySessionKey := map[int]int{}
		if len(sessionKeys) > 0 {
			type winRow struct {
				SessionKey   int `gorm:"column:session_key"`
				DriverNumber int `gorm:"column:driver_number"`
			}
			var rows []winRow
			_ = db.Raw(`
				SELECT session_key, driver_number
				FROM openf1_session_result
				WHERE session_key IN (?) AND position = 1
			`, sessionKeys).Scan(&rows).Error
			for _, it := range rows {
				if it.DriverNumber > 0 {
					winnerBySessionKey[it.SessionKey] = it.DriverNumber
				}
			}
		}

		type fastLap struct {
			DriverNumber int
			Seconds      float64
		}
		fastestBySessionKey := map[int]fastLap{}
		if len(sessionKeys) > 0 {
			type fastRow struct {
				SessionKey   int     `gorm:"column:session_key"`
				DriverNumber int     `gorm:"column:driver_number"`
				LapDuration  float64 `gorm:"column:lap_duration"`
			}
			var rows []fastRow
			_ = db.Raw(`
				SELECT l.session_key, l.driver_number, l.lap_duration
				FROM openf1_laps l
				JOIN (
					SELECT session_key, MIN(lap_duration) AS min_dur
					FROM openf1_laps
					WHERE session_key IN (?)
					  AND lap_duration IS NOT NULL
					  AND lap_duration > 0
					GROUP BY session_key
				) t ON t.session_key = l.session_key AND t.min_dur = l.lap_duration
			`, sessionKeys).Scan(&rows).Error
			for _, it := range rows {
				if it.DriverNumber <= 0 || !(it.LapDuration > 0) {
					continue
				}
				if _, ok := fastestBySessionKey[it.SessionKey]; ok {
					continue
				}
				fastestBySessionKey[it.SessionKey] = fastLap{DriverNumber: it.DriverNumber, Seconds: it.LapDuration}
			}
		}

		driverNums := map[int]struct{}{}
		for _, dn := range winnerBySessionKey {
			driverNums[dn] = struct{}{}
		}
		for _, it := range fastestBySessionKey {
			driverNums[it.DriverNumber] = struct{}{}
		}
		driverNumList := make([]int, 0, len(driverNums))
		for dn := range driverNums {
			driverNumList = append(driverNumList, dn)
		}

		type drvInfo struct {
			FullName    string
			NameAcronym string
		}
		drvByKey := map[string]drvInfo{}
		if len(sessionKeys) > 0 && len(driverNumList) > 0 {
			type drvRow struct {
				SessionKey   int     `gorm:"column:session_key"`
				DriverNumber int     `gorm:"column:driver_number"`
				FullName     *string `gorm:"column:full_name"`
				NameAcronym  *string `gorm:"column:name_acronym"`
			}
			var rows []drvRow
			_ = db.Raw(`
				SELECT session_key, driver_number, full_name, name_acronym
				FROM openf1_drivers
				WHERE session_key IN (?) AND driver_number IN (?)
			`, sessionKeys, driverNumList).Scan(&rows).Error
			for _, it := range rows {
				k := fmt.Sprintf("%d:%d", it.SessionKey, it.DriverNumber)
				inf := drvInfo{}
				if it.FullName != nil {
					inf.FullName = strings.TrimSpace(*it.FullName)
				}
				if it.NameAcronym != nil {
					inf.NameAcronym = strings.TrimSpace(*it.NameAcronym)
				}
				drvByKey[k] = inf
			}
		}

		baseURL := inferBaseURL(c)
		absURL := func(v string) string {
			s := strings.TrimSpace(v)
			if s == "" {
				return ""
			}
			if strings.HasPrefix(s, "http://") || strings.HasPrefix(s, "https://") {
				return s
			}
			if !strings.HasPrefix(s, "/") {
				s = "/" + s
			}
			if baseURL == "" {
				return s
			}
			return baseURL + s
		}

		type tmpItem struct {
			Dt  time.Time
			Obj any
		}
		tmp := make([]tmpItem, 0, len(races))
		for _, r := range races {
			round, ok := anyToInt(r["round"])
			if !ok || round <= 0 {
				continue
			}
			raceName := strings.TrimSpace(fmt.Sprintf("%v", r["raceName"]))
			if raceName == "" || raceName == "<nil>" {
				raceName = fmt.Sprintf("Round %d", round)
			}

			sk := sessionKeyByRound[round]
			startUTC := startBySessionKey[sk]
			if startUTC.IsZero() {
				startUTC = parseScheduleStartUTC(r)
			}
			if startUTC.IsZero() {
				continue
			}
			showFromUTC := earliestWeekendStartUTC(r)
			if showFromUTC.IsZero() {
				showFromUTC = startUTC
			}
			if showFromUTC.After(nowUTC) {
				continue
			}
			dateISO := startUTC.In(loc).Format("2006-01-02")
			dateLocal := startUTC.In(loc).Format("01.02")

			circuitID := ""
			circuitName := ""
			thumbURL := ""
			a := assetsByRound[round]
			if a == nil {
				a = assetsByDate[dateISO]
			}
			if a == nil {
				a = assetsByRaceName[strings.ToLower(raceName)]
			}
			if a != nil {
				circuitID = strings.TrimSpace(fmt.Sprintf("%v", a["circuit_id"]))
				if circuitID == "<nil>" {
					circuitID = ""
				}
				circuitName = strings.TrimSpace(fmt.Sprintf("%v", a["circuit_name"]))
				if circuitName == "<nil>" {
					circuitName = ""
				}
				thumbURL = absURL(fmt.Sprintf("%v", a["public_map_image_url"]))
			}
			mapURL := ""
			if circuitID != "" {
				mapURL = absURL(fmt.Sprintf("/static/circuits/%d/%s.png", season, circuitID))
				if staticDir != "" && ensureRawMapPng(staticDir, season, circuitID) {
					mapURL = absURL(fmt.Sprintf("/static/circuits/%d/raw/%s_map.png", season, circuitID))
				}
			} else if thumbURL != "" {
				mapURL = thumbURL
			}

			winDN := winnerBySessionKey[sk]
			winKey := fmt.Sprintf("%d:%d", sk, winDN)
			winInfo := drvByKey[winKey]

			fast := fastestBySessionKey[sk]
			fastKey := fmt.Sprintf("%d:%d", sk, fast.DriverNumber)
			fastInfo := drvByKey[fastKey]

			tmp = append(tmp, tmpItem{Dt: startUTC, Obj: gin.H{
				"season":     season,
				"round":      round,
				"race_name":  raceName,
				"date_iso":   dateISO,
				"date_local": dateLocal,
				"openf1_race_session_key": func() any {
					if sk <= 0 {
						return nil
					}
					return sk
				}(),
				"circuit": gin.H{
					"circuit_id":    circuitID,
					"circuit_name":  circuitName,
					"map_image_url": emptyToNil(mapURL),
				},
				"winner": gin.H{
					"driver_number": func() any {
						if winDN <= 0 {
							return nil
						}
						return winDN
					}(),
					"full_name":    emptyToNil(winInfo.FullName),
					"name_acronym": emptyToNil(winInfo.NameAcronym),
				},
				"fastest_lap": gin.H{
					"driver_number": func() any {
						if fast.DriverNumber <= 0 {
							return nil
						}
						return fast.DriverNumber
					}(),
					"full_name":    emptyToNil(fastInfo.FullName),
					"name_acronym": emptyToNil(fastInfo.NameAcronym),
					"time":         emptyToNil(formatLapDuration(fast.Seconds)),
					"seconds": func() any {
						if !(fast.Seconds > 0) {
							return nil
						}
						return math.Round(fast.Seconds*1000) / 1000
					}(),
				},
			}})
		}

		sort.Slice(tmp, func(i, j int) bool {
			return tmp[i].Dt.After(tmp[j].Dt)
		})
		out := make([]any, 0, len(tmp))
		for _, it := range tmp {
			out = append(out, it.Obj)
		}

		c.JSON(200, gin.H{
			"ok":               true,
			"generated_at_utc": time.Now().UTC().Format(time.RFC3339Nano),
			"season":           season,
			"tz":               tzName,
			"base_url":         baseURL,
			"races":            out,
		})
	}
}

func parseScheduleStartUTC(r map[string]any) time.Time {
	dateS := strings.TrimSpace(fmt.Sprintf("%v", r["date"]))
	if len(dateS) >= 10 {
		dateS = dateS[:10]
	}
	timeS := strings.TrimSpace(fmt.Sprintf("%v", r["time"]))
	if dateS == "" || dateS == "<nil>" {
		return time.Time{}
	}
	if timeS == "" || timeS == "<nil>" {
		if dt, err := time.Parse("2006-01-02", dateS); err == nil {
			return dt.UTC()
		}
		return time.Time{}
	}
	dt, err := time.Parse("2006-01-02 15:04:05Z", dateS+" "+timeS)
	if err != nil {
		return time.Time{}
	}
	return dt.UTC()
}

func earliestWeekendStartUTC(r map[string]any) time.Time {
	fields := []string{"FirstPractice", "SecondPractice", "ThirdPractice", "Qualifying", "SprintQualifying", "Sprint", "Race"}
	var earliest time.Time
	for _, f := range fields {
		v, ok := r[f]
		if !ok || v == nil {
			continue
		}
		m, ok := v.(map[string]any)
		if !ok || m == nil {
			continue
		}
		dt := parseScheduleStartUTC(m)
		if dt.IsZero() {
			continue
		}
		if earliest.IsZero() || dt.Before(earliest) {
			earliest = dt
		}
	}
	return earliest
}

func extractScheduleRaces(schedule map[string]any) []map[string]any {
	mr, ok := schedule["MRData"].(map[string]any)
	if !ok || mr == nil {
		return nil
	}
	rt, ok := mr["RaceTable"].(map[string]any)
	if !ok || rt == nil {
		return nil
	}
	raw, ok := rt["Races"].([]any)
	if !ok {
		return nil
	}
	out := make([]map[string]any, 0, len(raw))
	for _, it := range raw {
		m, ok := it.(map[string]any)
		if !ok || m == nil {
			continue
		}
		out = append(out, m)
	}
	return out
}

func ensureRawMapPng(staticDir string, season int, circuitID string) bool {
	dst := filepath.Join(staticDir, "circuits", fmt.Sprintf("%d", season), "raw", circuitID+"_map.png")
	if fileExists(dst) {
		return true
	}
	rawDir := filepath.Join(staticDir, "circuits", fmt.Sprintf("%d", season), "raw")
	src := filepath.Join(rawDir, circuitID+"_map.webp")
	if !fileExists(src) {
		matches, _ := filepath.Glob(filepath.Join(rawDir, circuitID+"_map.*"))
		for _, m := range matches {
			if strings.HasSuffix(strings.ToLower(m), ".png") {
				continue
			}
			if fileExists(m) {
				src = m
				break
			}
		}
		if !fileExists(src) {
			return false
		}
	}
	ffmpegPath, err := exec.LookPath("ffmpeg")
	if err != nil {
		return false
	}
	_ = os.MkdirAll(filepath.Dir(dst), 0o755)
	tmp := dst + ".tmp"
	cmd := exec.Command(ffmpegPath, "-y", "-v", "error", "-i", src, tmp)
	if err := cmd.Run(); err != nil {
		_ = os.Remove(tmp)
		return false
	}
	_ = os.Remove(dst)
	if err := os.Rename(tmp, dst); err != nil {
		_ = os.Remove(tmp)
		return false
	}
	return fileExists(dst)
}

func fileExists(p string) bool {
	st, err := os.Stat(p)
	if err != nil {
		return false
	}
	return st.Mode().IsRegular()
}

func anyToInt(v any) (int, bool) {
	switch t := v.(type) {
	case int:
		return t, true
	case int32:
		return int(t), true
	case int64:
		return int(t), true
	case float64:
		return int(t), true
	case string:
		s := strings.TrimSpace(t)
		if s == "" {
			return 0, false
		}
		var n int
		_, err := fmt.Sscanf(s, "%d", &n)
		if err != nil {
			return 0, false
		}
		return n, true
	default:
		s := strings.TrimSpace(fmt.Sprintf("%v", v))
		if s == "" || s == "<nil>" {
			return 0, false
		}
		var n int
		_, err := fmt.Sscanf(s, "%d", &n)
		if err != nil {
			return 0, false
		}
		return n, true
	}
}

func formatLapDuration(seconds float64) string {
	if !(seconds > 0) {
		return ""
	}
	msTotal := int64(math.Round(seconds * 1000))
	minutes := msTotal / 60000
	sec := (msTotal % 60000) / 1000
	ms := msTotal % 1000
	return fmt.Sprintf("%d:%02d.%03d", minutes, sec, ms)
}

func inferBaseURL(c *gin.Context) string {
	proto := strings.TrimSpace(c.GetHeader("X-Forwarded-Proto"))
	if proto == "" {
		if c.Request.TLS != nil {
			proto = "https"
		} else {
			proto = "http"
		}
	}
	host := strings.TrimSpace(c.Request.Host)
	if host == "" {
		host = strings.TrimSpace(c.GetHeader("Host"))
	}
	if host == "" {
		return ""
	}
	return proto + "://" + host
}

func emptyToNil(s string) any {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	return s
}

func uniqIntsLocal(in []int) []int {
	seen := map[int]struct{}{}
	out := make([]int, 0, len(in))
	for _, v := range in {
		if _, ok := seen[v]; ok {
			continue
		}
		seen[v] = struct{}{}
		out = append(out, v)
	}
	return out
}
