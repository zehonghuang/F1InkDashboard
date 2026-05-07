package f1logic

import (
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"
)

func BuildPagesPayload(nowUTC time.Time, tzName string, scheduleJSON map[string]any, season int, driverStandings map[string]any, constructorStandings map[string]any, circuitAssets map[string]any, lastWinner any, airTempC any, news any, lastNResults map[string]any) map[string]any {
	tz, err := time.LoadLocation(tzName)
	if err != nil {
		tzName = "UTC"
		tz = time.UTC
	}
	sh, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		sh = time.UTC
	}

	racesDT := scheduleRacesWithDT(scheduleJSON)
	var lastRace map[string]any
	var lastRaceDt *time.Time
	var nextRace map[string]any
	var nextRaceDt *time.Time
	for _, it := range racesDT {
		if !it.Dt.After(nowUTC) {
			lastRace = it.Obj
			dt := it.Dt
			lastRaceDt = &dt
		} else if nextRace == nil {
			nextRace = it.Obj
			dt := it.Dt
			nextRaceDt = &dt
			break
		}
	}
	if nextRace == nil && lastRace == nil && len(racesDT) > 0 {
		nextRace = racesDT[0].Obj
		dt := racesDT[0].Dt
		nextRaceDt = &dt
	}

	displayRace := nextRace
	displayRaceDt := nextRaceDt
	if nextRaceDt != nil {
		raceDtSh := nextRaceDt.In(sh)
		wdGo := int(raceDtSh.Weekday())
		pyWd := (wdGo + 6) % 7
		backDays := pyWd
		if backDays == 0 {
			backDays = 7
		}
		startD := time.Date(raceDtSh.Year(), raceDtSh.Month(), raceDtSh.Day(), 0, 0, 0, 0, sh).AddDate(0, 0, -backDays)
		nowSh := nowUTC.In(sh)
		if nowSh.Before(startD) && lastRace != nil {
			displayRace = lastRace
			displayRaceDt = lastRaceDt
		}
	}

	previewRace := nextRace
	previewRaceDt := nextRaceDt
	if nextRaceDt != nil && displayRaceDt != nil && displayRace != nil && nextRace != nil {
		if strconv.FormatInt(int64(toIntDefault(displayRace["round"])), 10) == strconv.FormatInt(int64(toIntDefault(nextRace["round"])), 10) {
			for _, it := range racesDT {
				if it.Dt.After(*nextRaceDt) {
					previewRace = it.Obj
					dt := it.Dt
					previewRaceDt = &dt
					break
				}
			}
		}
	}

	header := map[string]any{
		"time":        nowUTC.In(tz).Format("15:04"),
		"date":        FmtHeaderDate(nowUTC, tz),
		"battery_pct": nil,
	}

	sessions := make([]any, 0, 8)
	if displayRace != nil {
		type item struct {
			Dt  time.Time
			Key string
		}
		items := make([]item, 0, 8)
		sMap := [][2]any{
			{"FP1", displayRace["FirstPractice"]},
			{"FP2", displayRace["SecondPractice"]},
			{"FP3", displayRace["ThirdPractice"]},
			{"SQ", firstNonNil(displayRace["SprintQualifying"], displayRace["SprintShootout"])},
			{"SPRINT", displayRace["Sprint"]},
			{"QUALI", displayRace["Qualifying"]},
			{"RACE", map[string]any{"date": displayRace["date"], "time": displayRace["time"]}},
		}
		for _, kv := range sMap {
			key := kv[0].(string)
			sm, ok := kv[1].(map[string]any)
			if !ok {
				continue
			}
			ds, _ := sm["date"].(string)
			if strings.TrimSpace(ds) == "" {
				continue
			}
			dt, ok := ParseErgastDT(ds, sm["time"])
			if !ok {
				continue
			}
			items = append(items, item{Dt: dt, Key: key})
		}
		for i := 0; i < len(items); i++ {
			for j := i + 1; j < len(items); j++ {
				if items[j].Dt.Before(items[i].Dt) {
					items[i], items[j] = items[j], items[i]
				}
			}
		}
		for _, it := range items {
			status := "UPCOMING"
			if !it.Dt.After(nowUTC) {
				status = "DONE"
			}
			sessions = append(sessions, map[string]any{
				"key":    it.Key,
				"when":   FmtDay(it.Dt, tz) + " " + FmtHHMM(it.Dt, tz),
				"status": status,
				"utc":    it.Dt.Format(time.RFC3339Nano),
			})
		}
	}

	var nextSession any = nil
	for _, s := range sessions {
		sm, ok := s.(map[string]any)
		if !ok {
			continue
		}
		utc, _ := sm["utc"].(string)
		dt, err := time.Parse(time.RFC3339Nano, utc)
		if err != nil {
			dt, err = time.Parse(time.RFC3339, utc)
		}
		if err != nil {
			continue
		}
		if dt.After(nowUTC) {
			delta := dt.Sub(nowUTC)
			nextSession = map[string]any{
				"key":           sm["key"],
				"starts_at_utc": dt.Format(time.RFC3339Nano),
				"in":            FormatHMS(delta),
				"seconds":       int(delta.Seconds()),
			}
			break
		}
	}
	if nextSession == nil && nextRaceDt != nil && nextRaceDt.After(nowUTC) && displayRace != nil && nextRace != nil {
		if strconv.FormatInt(int64(toIntDefault(displayRace["round"])), 10) == strconv.FormatInt(int64(toIntDefault(nextRace["round"])), 10) {
			delta := nextRaceDt.Sub(nowUTC)
			nextSession = map[string]any{
				"key":           "RACE",
				"starts_at_utc": nextRaceDt.Format(time.RFC3339Nano),
				"in":            FormatHMS(delta),
				"seconds":       int(delta.Seconds()),
			}
		}
	}

	air, airOK := toFloat64(airTempC)
	weather := map[string]any{
		"air_c":             nil,
		"track_c":           nil,
		"track_c_estimated": false,
	}
	if airOK {
		weather["air_c"] = air
		weather["track_c"] = math.Round((air+13.0)*10) / 10
		weather["track_c_estimated"] = true
	}

	circuitID := ""
	if displayRace != nil {
		if c, ok := displayRace["Circuit"].(map[string]any); ok {
			if s, ok := c["circuitId"].(string); ok {
				circuitID = s
			}
		}
	}
	lapRecord := any(nil)
	if circuitID == "bahrain" {
		lapRecord = "1:31.447"
	}

	raceDay := map[string]any{
		"header": header,
		"race": map[string]any{
			"name":  getStr(displayRace, "raceName"),
			"round": anyField(displayRace, "round"),
		},
		"preview_race": map[string]any{
			"name":          getStr(previewRace, "raceName"),
			"round":         anyField(previewRace, "round"),
			"starts_at_utc": isoOrNil(previewRaceDt),
		},
		"next_race": map[string]any{
			"name":          getStr(nextRace, "raceName"),
			"round":         anyField(nextRace, "round"),
			"starts_at_utc": isoOrNil(nextRaceDt),
		},
		"last_race": map[string]any{
			"name":          getStr(lastRace, "raceName"),
			"round":         anyField(lastRace, "round"),
			"starts_at_utc": isoOrNil(lastRaceDt),
		},
		"next_session": nextSession,
		"schedule":     sessions,
		"weather":      weather,
		"tyre":         nil,
		"last_winner":  lastWinner,
		"lap_record":   lapRecord,
		"circuit":      nil,
	}

	if displayRace != nil && circuitAssets != nil {
		hit := PickCircuitForRace(getStr(displayRace, "raceName"), circuitID, circuitAssets)
		if hit != nil {
			stats, _ := hit["stats"].(map[string]any)
			if stats == nil {
				stats = map[string]any{}
			}
			raceDay["circuit"] = map[string]any{
				"name":                  getStr(displayRace, "raceName"),
				"circuit_id":            hit["circuit_id"],
				"circuit_name":          hit["circuit_name"],
				"formula1_slug":         hit["formula1_slug"],
				"image_kind":            hit["image_kind"],
				"map_image_url":         hit["public_map_image_url"],
				"map_image_url_detail":  hit["public_map_image_url_detail"],
				"source_map_image_url":  hit["source_map_image_url"],
				"downloaded":            truthy(hit["downloaded"]),
				"downloaded_detail":     truthy(hit["downloaded_detail"]),
				"circuit_length_km":     stats["circuit_length_km"],
				"first_grand_prix_year": stats["first_grand_prix_year"],
				"number_of_laps":        stats["number_of_laps"],
				"race_distance_km":      stats["race_distance_km"],
				"fastest_lap_time":      stats["fastest_lap_time"],
				"fastest_lap_driver":    stats["fastest_lap_driver"],
				"fastest_lap_year":      stats["fastest_lap_year"],
			}
		}
	}

	driversAll := parseDriversAll(driverStandings)
	constructorsAll := parseConstructorsAll(constructorStandings)

	daysToNext := any(nil)
	until := any(nil)
	if nextRaceDt != nil && nextRace != nil {
		days := int(nextRaceDt.In(tz).Truncate(24*time.Hour).Sub(nowUTC.In(tz).Truncate(24*time.Hour)).Hours() / 24)
		daysToNext = days
		u := strings.ToUpper(getStr(nextRace, "raceName"))
		u = strings.ReplaceAll(u, " GRAND PRIX", "")
		until = u
	}

	drivers := sliceAny(driversAll, 5)
	constructors := sliceAny(constructorsAll, 3)

	offWeek := map[string]any{
		"header": map[string]any{
			"title":        fmt.Sprintf("%d F1 SEASON STANDINGS", season),
			"days_to_next": daysToNext,
			"until":        until,
		},
		"drivers":          drivers,
		"constructors":     constructors,
		"drivers_all":      driversAll,
		"constructors_all": constructorsAll,
		"news":             news,
	}

	lastN := []any{}
	if lastNResults != nil {
		if mr, ok := lastNResults["MRData"].(map[string]any); ok {
			if rt, ok := mr["RaceTable"].(map[string]any); ok {
				if races, ok := rt["Races"].([]any); ok {
					lastN = races
				}
			}
		}
	}

	return map[string]any{
		"generated_at_utc": nowUTC.Format(time.RFC3339Nano),
		"tz":               tzName,
		"circuits":         circuitAssets,
		"race_day":         raceDay,
		"off_week":         offWeek,
		"last_results":     map[string]any{"races": lastN},
	}
}

type raceWithDT struct {
	Dt  time.Time
	Obj map[string]any
}

func scheduleRacesWithDT(scheduleJSON map[string]any) []raceWithDT {
	racesAny := []any{}
	if mr, ok := scheduleJSON["MRData"].(map[string]any); ok {
		if rt, ok := mr["RaceTable"].(map[string]any); ok {
			if xs, ok := rt["Races"].([]any); ok {
				racesAny = xs
			}
		}
	}
	out := make([]raceWithDT, 0, len(racesAny))
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
		out = append(out, raceWithDT{Dt: dt, Obj: rm})
	}
	for i := 0; i < len(out); i++ {
		for j := i + 1; j < len(out); j++ {
			if out[j].Dt.Before(out[i].Dt) {
				out[i], out[j] = out[j], out[i]
			}
		}
	}
	return out
}

func firstNonNil(a any, b any) any {
	if a != nil {
		return a
	}
	return b
}

func isoOrNil(dt *time.Time) any {
	if dt == nil {
		return nil
	}
	return dt.UTC().Format(time.RFC3339Nano)
}

func getStr(m map[string]any, key string) string {
	if m == nil {
		return ""
	}
	if s, ok := m[key].(string); ok {
		return s
	}
	return ""
}

func anyField(m map[string]any, key string) any {
	if m == nil {
		return nil
	}
	if v, ok := m[key]; ok {
		return v
	}
	return nil
}

func toIntDefault(v any) int {
	if n, ok := toInt(v); ok {
		return n
	}
	return 0
}

func toFloat64(v any) (float64, bool) {
	switch x := v.(type) {
	case float64:
		return x, true
	case float32:
		return float64(x), true
	case int:
		return float64(x), true
	case int64:
		return float64(x), true
	case string:
		f, err := strconv.ParseFloat(strings.TrimSpace(x), 64)
		if err == nil {
			return f, true
		}
		return 0, false
	default:
		return 0, false
	}
}

func parseDriversAll(driverStandings map[string]any) []any {
	rowsAny := []any{}
	if mr, ok := driverStandings["MRData"].(map[string]any); ok {
		if st, ok := mr["StandingsTable"].(map[string]any); ok {
			if sl, ok := st["StandingsLists"].([]any); ok && len(sl) > 0 {
				if s0, ok := sl[0].(map[string]any); ok {
					if ds, ok := s0["DriverStandings"].([]any); ok {
						rowsAny = ds
					}
				}
			}
		}
	}
	out := make([]any, 0, len(rowsAny))
	for _, it := range rowsAny {
		row, ok := it.(map[string]any)
		if !ok {
			continue
		}
		drv, _ := row["Driver"].(map[string]any)
		code := strings.TrimSpace(getStr(drv, "code"))
		if code == "" {
			id := strings.ToUpper(strings.TrimSpace(getStr(drv, "driverId")))
			if len(id) > 3 {
				id = id[:3]
			}
			code = id
		}
		family := strings.ToUpper(strings.TrimSpace(getStr(drv, "familyName")))
		given := strings.ToUpper(strings.TrimSpace(getStr(drv, "givenName")))
		pts := 0
		if p, ok := toFloat64(row["points"]); ok {
			pts = int(p)
		}
		constructors, _ := row["Constructors"].([]any)
		c0 := map[string]any{}
		if len(constructors) > 0 {
			c0, _ = constructors[0].(map[string]any)
		}
		name := strings.TrimSpace(family)
		if given != "" || family != "" {
			g0 := ""
			if given != "" {
				g0 = given[:1]
			}
			name = strings.TrimSpace(g0 + ". " + family)
		}
		out = append(out, map[string]any{
			"pos":            toIntDefault(row["position"]),
			"driver_id":      getStr(drv, "driverId"),
			"code":           code,
			"given":          given,
			"family":         family,
			"name":           name,
			"constructor_id": getStr(c0, "constructorId"),
			"constructor":    strings.ToUpper(strings.TrimSpace(getStr(c0, "name"))),
			"points":         pts,
		})
	}
	return out
}

func parseConstructorsAll(constructorStandings map[string]any) []any {
	rowsAny := []any{}
	if mr, ok := constructorStandings["MRData"].(map[string]any); ok {
		if st, ok := mr["StandingsTable"].(map[string]any); ok {
			if sl, ok := st["StandingsLists"].([]any); ok && len(sl) > 0 {
				if s0, ok := sl[0].(map[string]any); ok {
					if cs, ok := s0["ConstructorStandings"].([]any); ok {
						rowsAny = cs
					}
				}
			}
		}
	}
	out := make([]any, 0, len(rowsAny))
	for _, it := range rowsAny {
		row, ok := it.(map[string]any)
		if !ok {
			continue
		}
		c, _ := row["Constructor"].(map[string]any)
		pts := 0
		if p, ok := toFloat64(row["points"]); ok {
			pts = int(p)
		}
		out = append(out, map[string]any{
			"pos":            toIntDefault(row["position"]),
			"constructor_id": getStr(c, "constructorId"),
			"name":           strings.ToUpper(strings.TrimSpace(getStr(c, "name"))),
			"points":         pts,
		})
	}
	return out
}

func sliceAny(in []any, n int) []any {
	if n <= 0 {
		return []any{}
	}
	if len(in) <= n {
		return in
	}
	return in[:n]
}
