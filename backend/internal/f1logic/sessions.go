package f1logic

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"

	"toinc_f1_backend/internal/f1db"

	"gorm.io/gorm"
)

func BuildSessionsPayload(db *gorm.DB, nowUTC time.Time, tzName string, scheduleJSON map[string]any, season int, roundOverride *int, session string, q *int, limit int) (map[string]any, error) {
	race, sessions, tzName2 := selectRaceAndSessions(scheduleJSON, nowUTC, tzName, roundOverride)
	tzName = tzName2

	state := "explicit"
	key := chooseSessionKey(session)
	if key == "AUTO" {
		autoKey, st := chooseAutoSessionWithState(nowUTC, sessions)
		state = st
		if autoKey != "" {
			key = autoKey
		} else {
			key = "FP1"
		}
	}
	kind := sessionKindFromKey(key)

	raceName := ""
	rnd := any(nil)
	country := ""
	if race != nil {
		if s, ok := race["raceName"].(string); ok {
			raceName = s
		}
		rnd = race["round"]
		if c, ok := race["Circuit"].(map[string]any); ok {
			if loc, ok := c["Location"].(map[string]any); ok {
				if s, ok := loc["country"].(string); ok {
					country = s
				}
			}
		}
	}

	var startsAtUTC any = nil
	var openf1SessionKey *int
	for _, it := range sessions {
		if strings.EqualFold(fmt.Sprintf("%v", it["key"]), key) {
			startsAtUTC = it["starts_at_utc"]
			if v, ok := it["openf1_session_key"]; ok && v != nil {
				if n, ok := toInt(v); ok {
					openf1SessionKey = &n
				}
			}
			break
		}
	}

	if state == "pre_event" || state == "no_schedule" {
		return map[string]any{
			"generated_at_utc": nowUTC.Format(time.RFC3339Nano),
			"tz":               tzName,
			"race":             map[string]any{"season": season, "round": toIntOrNil(rnd), "name": raceName, "country": country},
			"session":          map[string]any{"key": key, "kind": "practice", "label": "FP1", "starts_at_utc": startsAtUTC, "time_remain": nil},
			"schedule":         sessions,
			"state":            state,
			"no_data":          true,
			"message":          "NO DATA",
			"table":            map[string]any{"kind": "practice", "rows": []any{}},
		}, nil
	}

	qv := 2
	if kind == "qualifying" {
		if q == nil {
			qv = inferQualiQ(nowUTC, startsAtUTC)
		} else {
			qv = ClampInt(*q, 1, 3)
		}
	} else {
		if q != nil {
			qv = *q
		}
	}

	label := sessionLabel(key, qv)

	var timeRemain any = nil
	if s, ok := startsAtUTC.(string); ok && strings.TrimSpace(s) != "" {
		dt, err := time.Parse(time.RFC3339Nano, s)
		if err != nil {
			dt, err = time.Parse(time.RFC3339, s)
		}
		if err == nil {
			durS := 3600
			if kind == "race" {
				durS = 2 * 3600
			}
			remain := dt.Add(time.Duration(durS) * time.Second).Sub(nowUTC)
			if remain.Seconds() >= 0 {
				tr := FormatHMS(remain)
				if len(tr) >= 8 {
					timeRemain = tr[3:8]
				} else {
					timeRemain = tr
				}
			} else {
				timeRemain = "00:00"
			}
		}
	}

	out := map[string]any{
		"generated_at_utc": nowUTC.Format(time.RFC3339Nano),
		"tz":               tzName,
		"race":             map[string]any{"season": season, "round": toIntOrNil(rnd), "name": raceName, "country": country},
		"session": map[string]any{
			"key":           key,
			"kind":          kind,
			"label":         label,
			"starts_at_utc": startsAtUTC,
			"time_remain":   timeRemain,
		},
		"schedule": sessions,
		"state":    state,
	}

	limit = ClampInt(limit, 1, 30)

	if kind == "qualifying" {
		if openf1SessionKey == nil || db == nil {
			out["no_data"] = true
			out["message"] = "NO DATA"
			out["table"] = map[string]any{"kind": "qualifying", "rows": []any{}, "drop_zone_after_index": nil, "q": qv}
			return out, nil
		}
		rowsDB, err := f1db.OpenF1SessionResultRows(db, *openf1SessionKey)
		if err != nil {
			return nil, err
		}
		sec123, err := f1db.OpenF1QualiSec123(db, *openf1SessionKey)
		if err != nil {
			return nil, err
		}
		if len(rowsDB) == 0 {
			out["no_data"] = true
			out["message"] = "NO DATA"
			out["table"] = map[string]any{"kind": "qualifying", "rows": []any{}, "drop_zone_after_index": nil, "q": qv}
			return out, nil
		}

		fmtSecAsLap := func(sec *float64) string {
			if sec == nil || !(*sec > 0) {
				return ""
			}
			ms := int((*sec)*1000.0 + 0.5)
			totalS := ms / 1000
			m := totalS / 60
			s := totalS % 60
			rem := ms % 1000
			return fmt.Sprintf("%d:%02d.%03d", m, s, rem)
		}

		pickStage := func(vals []any, stage int) *float64 {
			if stage < 0 || stage >= len(vals) {
				return nil
			}
			switch v := vals[stage].(type) {
			case float64:
				return &v
			case int:
				f := float64(v)
				return &f
			default:
				return nil
			}
		}

		pickDuration := func(vals []any) *float64 {
			if qv == 1 {
				return pickStage(vals, 0)
			}
			if qv == 2 {
				if v := pickStage(vals, 1); v != nil {
					return v
				}
				return pickStage(vals, 0)
			}
			if v := pickStage(vals, 2); v != nil {
				return v
			}
			if v := pickStage(vals, 1); v != nil {
				return v
			}
			return pickStage(vals, 0)
		}

		pickGap := func(vals []any) *float64 {
			return pickDuration(vals)
		}

		rows := make([]any, 0, limit)
		for _, it := range rowsDB {
			posI, ok := toInt(it["position"])
			if !ok || posI <= 0 {
				continue
			}
			pos := fmt.Sprintf("%02d", posI)
			no := ""
			if dn, ok := toInt(it["driver_number"]); ok {
				no = strconv.Itoa(dn)
			}
			code := strings.ToUpper(strings.TrimSpace(fmt.Sprintf("%v", it["name_acronym"])))

			var durS *float64
			if v, ok := it["duration_s"].(float64); ok {
				durS = &v
			}
			var gapS *float64
			if v, ok := it["gap_to_leader_s"].(float64); ok {
				gapS = &v
			}
			if durS == nil {
				if vals := parseJSONList(it["duration_json"]); vals != nil {
					durS = pickDuration(vals)
				}
			}
			if gapS == nil {
				if vals := parseJSONList(it["gap_to_leader_json"]); vals != nil {
					gapS = pickGap(vals)
				}
			}

			lap := fmtSecAsLap(durS)
			var gapTxt string
			if pos == "01" || pos == "1" {
				gapTxt = "---"
			} else {
				if gapS == nil {
					gapTxt = "---"
				} else {
					ms := int((*gapS)*1000.0 + 0.5)
					gapTxt = FmtGap(&ms)
				}
			}

			sec := sec123Synth(pos)
			if no != "" {
				if dn, err := strconv.Atoi(no); err == nil {
					if s, ok := sec123[dn]; ok {
						sec = s
					}
				}
			}

			rows = append(rows, map[string]any{
				"pos":      pos,
				"no":       no,
				"drv":      code,
				"lap_time": lap,
				"gap":      gapTxt,
				"st":       "---",
				"sec123":   sec,
			})
			if len(rows) >= limit {
				break
			}
		}

		var dz any = nil
		if len(rows) >= 10 {
			for i, r := range rows {
				if m, ok := r.(map[string]any); ok {
					if m["pos"] == "10" {
						dz = i
						break
					}
				}
			}
		}
		out["table"] = map[string]any{"kind": "qualifying", "rows": rows, "drop_zone_after_index": dz, "q": qv}
		out["results_race"] = map[string]any{"season": season, "round": toIntOrNil(rnd), "name": raceName, "country": country}
		return out, nil
	}

	if kind == "race" {
		if openf1SessionKey == nil || db == nil {
			out["no_data"] = true
			out["message"] = "NO DATA"
			out["table"] = map[string]any{"kind": "race", "rows": []any{}}
			return out, nil
		}
		rowsDB, err := f1db.OpenF1SessionResultRows(db, *openf1SessionKey)
		if err != nil {
			return nil, err
		}
		pitCounts, err := f1db.OpenF1PitCounts(db, *openf1SessionKey)
		if err != nil {
			return nil, err
		}
		if len(rowsDB) == 0 {
			out["no_data"] = true
			out["message"] = "NO DATA"
			out["table"] = map[string]any{"kind": "race", "rows": []any{}}
			return out, nil
		}

		var leaderTime *float64
		for _, it := range rowsDB {
			if pos, ok := toInt(it["position"]); ok && pos == 1 {
				if v, ok := it["duration_s"].(float64); ok {
					leaderTime = &v
				}
				break
			}
		}

		fmtRaceTime := func(sec *float64) string {
			if sec == nil || !(*sec > 0) {
				return ""
			}
			ms := int((*sec)*1000.0 + 0.5)
			totalS := ms / 1000
			h := totalS / 3600
			m := (totalS % 3600) / 60
			s := totalS % 60
			rem := ms % 1000
			if h > 0 {
				return fmt.Sprintf("%d:%02d:%02d.%03d", h, m, s, rem)
			}
			return fmt.Sprintf("%d:%02d.%03d", m, s, rem)
		}

		rows := make([]any, 0, limit)
		for _, it := range rowsDB {
			posI, ok := toInt(it["position"])
			if !ok || posI <= 0 {
				continue
			}
			pos := fmt.Sprintf("%02d", posI)
			dnI, _ := toInt(it["driver_number"])
			no := ""
			if dnI > 0 {
				no = strconv.Itoa(dnI)
			}
			code := strings.ToUpper(strings.TrimSpace(fmt.Sprintf("%v", it["name_acronym"])))

			status := "Finished"
			if truthy(it["dsq"]) {
				status = "DSQ"
			} else if truthy(it["dns"]) {
				status = "DNS"
			} else if truthy(it["dnf"]) {
				status = "DNF"
			}

			var durS *float64
			if v, ok := it["duration_s"].(float64); ok {
				durS = &v
			}
			var gapS *float64
			if v, ok := it["gap_to_leader_s"].(float64); ok {
				gapS = &v
			}

			gapTxt := ""
			if pos == "01" {
				gapTxt = fmtRaceTime(durS)
				if gapTxt == "" {
					gapTxt = status
				}
			} else {
				if gapS != nil {
					gapTxt = fmt.Sprintf("+%.3f", *gapS)
				} else {
					if s, ok := parseJSONOrString(it["gap_to_leader_json"]); ok && s != "" {
						gapTxt = s
					} else if leaderTime != nil && durS != nil && *durS >= *leaderTime {
						gapTxt = fmt.Sprintf("+%.3f", (*durS - *leaderTime))
					} else {
						gapTxt = status
					}
				}
			}

			pts := ""
			ps, _ := toFloat(it["points_start"])
			pc, _ := toFloat(it["points_current"])
			if ps != nil && pc != nil {
				pts = strconv.Itoa(int((*pc - *ps) + 0.5))
			}

			pit := ""
			if dnI > 0 {
				if n, ok := pitCounts[dnI]; ok {
					pit = strconv.Itoa(n)
				}
			}

			rows = append(rows, map[string]any{
				"pos":        pos,
				"no":         no,
				"drv":        code,
				"gap_status": gapTxt,
				"status":     status,
				"pts":        pts,
				"pit":        pit,
			})
			if len(rows) >= limit {
				break
			}
		}

		out["table"] = map[string]any{"kind": "race", "rows": rows}
		out["results_race"] = map[string]any{"season": season, "round": toIntOrNil(rnd), "name": raceName, "country": country}
		return out, nil
	}

	mock := [][5]any{
		{"01", "01", "VER", 90056, 24},
		{"02", "16", "LEC", 90421, 22},
		{"03", "04", "NOR", 90882, 26},
		{"04", "44", "HAM", 91012, 18},
		{"05", "81", "PIA", 91150, 25},
		{"06", "63", "RUS", 91220, 20},
		{"07", "55", "SAI", 91405, 23},
		{"08", "14", "ALO", 91550, 19},
		{"09", "27", "HUL", 91880, 21},
		{"10", "18", "STR", 92105, 17},
		{"11", "23", "ALB", 92240, 16},
	}
	baseMS := 0
	if len(mock) > 0 {
		baseMS = mock[0][3].(int)
	}
	fmtMS := func(ms int) string {
		if ms < 0 {
			ms = 0
		}
		totalS := ms / 1000
		m := totalS / 60
		s := totalS % 60
		rem := ms % 1000
		return fmt.Sprintf("%d:%02d.%03d", m, s, rem)
	}
	rows := make([]any, 0, limit)
	for i := 0; i < len(mock) && i < limit; i++ {
		pos := mock[i][0].(string)
		no := mock[i][1].(string)
		drv := mock[i][2].(string)
		bestMS := mock[i][3].(int)
		laps := mock[i][4].(int)
		gap := "---"
		if i != 0 {
			d := bestMS - baseMS
			gap = FmtGap(&d)
		}
		rows = append(rows, map[string]any{
			"pos":       pos,
			"no":        no,
			"drv":       drv,
			"best_time": fmtMS(bestMS),
			"best":      fmtMS(bestMS),
			"gap":       gap,
			"laps":      strconv.Itoa(laps),
		})
	}
	out["table"] = map[string]any{"kind": "practice", "rows": rows}
	out["panel"] = map[string]any{
		"status":       "GREEN",
		"track_temp_c": 42,
		"air_temp_c":   29,
		"humidity_pct": 55,
	}
	return out, nil
}

func selectRaceAndSessions(scheduleJSON map[string]any, nowUTC time.Time, tzName string, roundOverride *int) (map[string]any, []map[string]any, string) {
	tz, err := time.LoadLocation(tzName)
	if err != nil {
		tzName = "UTC"
		tz = time.UTC
	}

	var racesAny []any
	if mr, ok := scheduleJSON["MRData"].(map[string]any); ok {
		if rt, ok := mr["RaceTable"].(map[string]any); ok {
			if xs, ok := rt["Races"].([]any); ok {
				racesAny = xs
			}
		}
	}
	racesDT := make([]struct {
		Dt  time.Time
		Obj map[string]any
	}, 0, len(racesAny))
	for _, r := range racesAny {
		rm, ok := r.(map[string]any)
		if !ok {
			continue
		}
		ds, _ := rm["date"].(string)
		if strings.TrimSpace(ds) == "" {
			continue
		}
		dt, ok := ParseErgastDT(ds, rm["time"])
		if !ok {
			continue
		}
		racesDT = append(racesDT, struct {
			Dt  time.Time
			Obj map[string]any
		}{Dt: dt, Obj: rm})
	}
	for i := 0; i < len(racesDT); i++ {
		for j := i + 1; j < len(racesDT); j++ {
			if racesDT[j].Dt.Before(racesDT[i].Dt) {
				racesDT[i], racesDT[j] = racesDT[j], racesDT[i]
			}
		}
	}

	var race map[string]any
	if roundOverride != nil {
		ro := strconv.Itoa(*roundOverride)
		for _, it := range racesDT {
			if fmt.Sprintf("%v", it.Obj["round"]) == ro {
				race = it.Obj
				break
			}
		}
	}
	if race == nil {
		var lastRace map[string]any
		var lastDt time.Time
		var hasLast bool
		var nextRace map[string]any
		var nextDt time.Time
		var hasNext bool

		for _, it := range racesDT {
			if !it.Dt.After(nowUTC) {
				lastRace = it.Obj
				lastDt = it.Dt
				hasLast = true
			} else if !hasNext {
				nextRace = it.Obj
				nextDt = it.Dt
				hasNext = true
				break
			}
		}
		if !hasNext {
			race = lastRace
		} else if !hasLast {
			race = nextRace
		} else {
			sh, err := time.LoadLocation("Asia/Shanghai")
			if err != nil {
				sh = time.UTC
			}
			nowSh := nowUTC.In(sh)
			raceDtSh := nextDt.In(sh)
			wd := int(raceDtSh.Weekday())
			backDays := 0
			if wd == 1 {
				backDays = 7
			} else if wd == 0 {
				backDays = 6
			} else {
				backDays = wd - 1
			}
			startD := time.Date(raceDtSh.Year(), raceDtSh.Month(), raceDtSh.Day(), 0, 0, 0, 0, sh).AddDate(0, 0, -backDays)
			isRaceWeek := !nowSh.Before(startD) && !nowSh.After(raceDtSh)
			if isRaceWeek {
				race = nextRace
			} else {
				race = lastRace
				_ = lastDt
			}
		}
	}

	sessions := []map[string]any{}
	if race != nil {
		type item struct {
			Dt  time.Time
			Key string
			S   map[string]any
		}
		items := make([]item, 0, 8)
		add := func(key string, s any) {
			sm, ok := s.(map[string]any)
			if !ok {
				return
			}
			ds, _ := sm["date"].(string)
			if strings.TrimSpace(ds) == "" {
				return
			}
			dt, ok := ParseErgastDT(ds, sm["time"])
			if !ok {
				return
			}
			items = append(items, item{Dt: dt, Key: key, S: sm})
		}
		add("FP1", race["FirstPractice"])
		add("FP2", race["SecondPractice"])
		add("FP3", race["ThirdPractice"])
		if v := race["SprintQualifying"]; v != nil {
			add("SQ", v)
		} else {
			add("SQ", race["SprintShootout"])
		}
		add("SPRINT", race["Sprint"])
		add("QUALI", race["Qualifying"])
		add("RACE", map[string]any{"date": race["date"], "time": race["time"], "openf1_session_key": race["openf1_race_session_key"]})

		for i := 0; i < len(items); i++ {
			for j := i + 1; j < len(items); j++ {
				if items[j].Dt.Before(items[i].Dt) {
					items[i], items[j] = items[j], items[i]
				}
			}
		}
		for _, it := range items {
			var sessKey any = nil
			if it.S != nil {
				if v, ok := it.S["openf1_session_key"]; ok && v != nil {
					if n, ok := toInt(v); ok {
						sessKey = n
					}
				}
			}
			sessions = append(sessions, map[string]any{
				"key":                it.Key,
				"starts_at_utc":      it.Dt.Format(time.RFC3339Nano),
				"when":               fmt.Sprintf("%s %s", FmtDay(it.Dt, tz), FmtHHMM(it.Dt, tz)),
				"openf1_session_key": sessKey,
			})
		}
	}

	return race, sessions, tzName
}

func chooseSessionKey(session string) string {
	s := strings.TrimSpace(strings.ToLower(session))
	switch s {
	case "fp1", "fp2", "fp3":
		return strings.ToUpper(s)
	case "q", "quali", "qualifying":
		return "QUALI"
	case "sq", "sprintquali", "sprint_qualifying", "sprint_qualify", "sprintshootout", "shootout", "ss":
		return "SQ"
	case "sprint", "spr":
		return "SPRINT"
	case "race", "r":
		return "RACE"
	case "auto", "":
		return "AUTO"
	default:
		return strings.ToUpper(s)
	}
}

func sessionLabel(key string, q int) string {
	k := strings.ToUpper(strings.TrimSpace(key))
	if k == "QUALI" {
		q = ClampInt(q, 1, 3)
		return fmt.Sprintf("Q%d", q)
	}
	return k
}

func sec123Synth(pos string) string {
	p := strings.TrimSpace(pos)
	switch p {
	case "02":
		return "PP-"
	case "04":
		return "GG-"
	case "06":
		return "G--"
	case "11":
		return "P--"
	default:
		return "---"
	}
}

func inferQualiQ(nowUTC time.Time, startsAtUTC any) int {
	s, ok := startsAtUTC.(string)
	if !ok || strings.TrimSpace(s) == "" {
		return 2
	}
	start, err := time.Parse(time.RFC3339Nano, strings.ReplaceAll(s, "Z", "+00:00"))
	if err != nil {
		return 2
	}
	elapsed := int(nowUTC.Sub(start).Seconds())
	if elapsed < 0 {
		return 1
	}
	q1 := 18 * 60
	gap := 7 * 60
	q2 := 15 * 60
	q3 := 12 * 60
	if elapsed < q1 {
		return 1
	}
	if elapsed < q1+gap {
		return 1
	}
	if elapsed < q1+gap+q2 {
		return 2
	}
	if elapsed < q1+gap+q2+gap {
		return 2
	}
	if elapsed < q1+gap+q2+gap+q3 {
		return 3
	}
	return 3
}

func sessionDurationS(key string) int {
	k := strings.ToUpper(strings.TrimSpace(key))
	if strings.HasPrefix(k, "FP") {
		return 60 * 60
	}
	if k == "QUALI" {
		return (18 + 7 + 15 + 7 + 12) * 60
	}
	if k == "SQ" || k == "SPRINT" {
		return 60 * 60
	}
	if k == "RACE" {
		return 2 * 60 * 60
	}
	return 60 * 60
}

func chooseAutoSessionWithState(nowUTC time.Time, sessions []map[string]any) (string, string) {
	type it struct {
		Dt  time.Time
		Key string
	}
	items := make([]it, 0, len(sessions))
	for _, s := range sessions {
		st, ok := s["starts_at_utc"].(string)
		if !ok {
			continue
		}
		dt, err := time.Parse(time.RFC3339Nano, strings.ReplaceAll(st, "Z", "+00:00"))
		if err != nil {
			continue
		}
		k := strings.ToUpper(strings.TrimSpace(fmt.Sprintf("%v", s["key"])))
		if k == "" {
			continue
		}
		items = append(items, it{Dt: dt.UTC(), Key: k})
	}
	for i := 0; i < len(items); i++ {
		for j := i + 1; j < len(items); j++ {
			if items[j].Dt.Before(items[i].Dt) {
				items[i], items[j] = items[j], items[i]
			}
		}
	}
	if len(items) == 0 {
		return "", "no_schedule"
	}
	first := items[0]
	last := items[len(items)-1]
	var curDt time.Time
	curKey := ""
	var nextDt time.Time
	nextKey := ""
	hasCur := false
	hasNext := false
	for _, x := range items {
		if !x.Dt.After(nowUTC) {
			curDt = x.Dt
			curKey = x.Key
			hasCur = true
		} else if !hasNext {
			nextDt = x.Dt
			nextKey = x.Key
			hasNext = true
			break
		}
	}
	if !hasCur {
		return first.Key, "pre_event"
	}
	endDt := curDt.Add(time.Duration(sessionDurationS(curKey)) * time.Second)
	if !nowUTC.After(endDt) {
		return curKey, "live"
	}
	if hasNext && nowUTC.Before(nextDt) {
		_ = nextKey
		return curKey, "between"
	}
	return last.Key, "post_event"
}

func sessionKindFromKey(key string) string {
	k := strings.ToUpper(strings.TrimSpace(key))
	if strings.HasPrefix(k, "FP") {
		return "practice"
	}
	if k == "QUALI" || k == "QUALIFYING" || k == "Q" {
		return "qualifying"
	}
	if k == "SQ" || k == "SPRINT_QUALI" || k == "SPRINT_QUALIFYING" || k == "SPRINT_QUALIFY" || k == "SPRINT_SHOOTOUT" || k == "SS" {
		return "qualifying"
	}
	if k == "SPRINT" || k == "RACE" {
		return "race"
	}
	return "unknown"
}

func parseJSONList(v any) []any {
	if v == nil {
		return nil
	}
	switch x := v.(type) {
	case []any:
		return x
	case string:
		s := strings.TrimSpace(x)
		if s == "" {
			return nil
		}
		var out any
		if err := json.Unmarshal([]byte(s), &out); err != nil {
			return nil
		}
		if xs, ok := out.([]any); ok {
			return xs
		}
		return nil
	case []byte:
		s := strings.TrimSpace(string(x))
		if s == "" {
			return nil
		}
		var out any
		if err := json.Unmarshal([]byte(s), &out); err != nil {
			return nil
		}
		if xs, ok := out.([]any); ok {
			return xs
		}
		return nil
	default:
		return nil
	}
}

func parseJSONOrString(v any) (string, bool) {
	if v == nil {
		return "", false
	}
	switch x := v.(type) {
	case string:
		s := strings.TrimSpace(x)
		if s == "" {
			return "", false
		}
		var out any
		if err := json.Unmarshal([]byte(s), &out); err == nil {
			if ss, ok := out.(string); ok {
				return ss, true
			}
		}
		return s, true
	case []byte:
		s := strings.TrimSpace(string(x))
		if s == "" {
			return "", false
		}
		var out any
		if err := json.Unmarshal([]byte(s), &out); err == nil {
			if ss, ok := out.(string); ok {
				return ss, true
			}
		}
		return s, true
	default:
		return strings.TrimSpace(fmt.Sprintf("%v", x)), true
	}
}

func toInt(v any) (int, bool) {
	switch x := v.(type) {
	case int:
		return x, true
	case int32:
		return int(x), true
	case int64:
		return int(x), true
	case uint:
		return int(x), true
	case uint16:
		return int(x), true
	case uint32:
		return int(x), true
	case uint64:
		return int(x), true
	case float64:
		return int(x), true
	case []byte:
		if n, err := strconv.Atoi(strings.TrimSpace(string(x))); err == nil {
			return n, true
		}
		return 0, false
	case string:
		if n, err := strconv.Atoi(strings.TrimSpace(x)); err == nil {
			return n, true
		}
		return 0, false
	default:
		return 0, false
	}
}

func toIntOrNil(v any) any {
	if n, ok := toInt(v); ok {
		return n
	}
	return nil
}

func toFloat(v any) (*float64, bool) {
	switch x := v.(type) {
	case float64:
		return &x, true
	case float32:
		f := float64(x)
		return &f, true
	case int:
		f := float64(x)
		return &f, true
	case int64:
		f := float64(x)
		return &f, true
	case uint:
		f := float64(x)
		return &f, true
	case uint64:
		f := float64(x)
		return &f, true
	case []byte:
		if f, err := strconv.ParseFloat(strings.TrimSpace(string(x)), 64); err == nil {
			return &f, true
		}
		return nil, false
	case string:
		if f, err := strconv.ParseFloat(strings.TrimSpace(x), 64); err == nil {
			return &f, true
		}
		return nil, false
	default:
		return nil, false
	}
}

func truthy(v any) bool {
	switch x := v.(type) {
	case bool:
		return x
	case int:
		return x != 0
	case int64:
		return x != 0
	case float64:
		return x != 0
	case []byte:
		s := strings.TrimSpace(string(x))
		return s == "1" || strings.EqualFold(s, "true")
	case string:
		s := strings.TrimSpace(x)
		return s == "1" || strings.EqualFold(s, "true")
	default:
		return false
	}
}
