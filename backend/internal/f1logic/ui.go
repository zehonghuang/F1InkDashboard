package f1logic

import (
	"fmt"
	"strconv"
	"strings"
	"time"
)

func BuildUiPagesPayload(pagesPayload map[string]any, season int, lang string) map[string]any {
	tzName, _ := pagesPayload["tz"].(string)
	if strings.TrimSpace(tzName) == "" {
		tzName = "UTC"
	}
	tz, err := time.LoadLocation(tzName)
	if err != nil {
		tzName = "UTC"
		tz = time.UTC
	}

	nowUTC := time.Now().UTC()
	if s, ok := pagesPayload["generated_at_utc"].(string); ok && strings.TrimSpace(s) != "" {
		if t, err := time.Parse(time.RFC3339Nano, strings.ReplaceAll(s, "Z", "+00:00")); err == nil {
			nowUTC = t.UTC()
		} else if t, err := time.Parse(time.RFC3339, strings.ReplaceAll(s, "Z", "+00:00")); err == nil {
			nowUTC = t.UTC()
		}
	}

	langNorm := strings.ToLower(strings.TrimSpace(lang))
	isZh := strings.HasPrefix(langNorm, "zh")

	raceDay, _ := pagesPayload["race_day"].(map[string]any)
	offWeek, _ := pagesPayload["off_week"].(map[string]any)

	race := map[string]any{}
	if raceDay != nil {
		race, _ = raceDay["race"].(map[string]any)
	}
	gpName := strings.TrimSpace(fmt.Sprintf("%v", race["name"]))
	if !isZh {
		gpName = strings.ToUpper(gpName)
		if gpName != "" && !strings.HasSuffix(gpName, " GRAND PRIX") {
			gpName = gpName + " GRAND PRIX"
		}
	}
	roundRaw := race["round"]
	roundNo, ok := toInt(roundRaw)
	roundText := any(nil)
	if ok {
		if isZh {
			roundText = fmt.Sprintf("第%02d站", roundNo)
		} else {
			roundText = fmt.Sprintf("ROUND %02d", roundNo)
		}
	} else if roundRaw != nil && strings.TrimSpace(fmt.Sprintf("%v", roundRaw)) != "" {
		if isZh {
			roundText = fmt.Sprintf("第%v站", roundRaw)
		} else {
			roundText = fmt.Sprintf("ROUND %v", roundRaw)
		}
	}

	nextSessionObj := map[string]any{}
	if raceDay != nil {
		nextSessionObj, _ = raceDay["next_session"].(map[string]any)
	}
	countdown := any(nil)
	if nextSessionObj != nil {
		if s, ok := nextSessionObj["in"].(string); ok && strings.TrimSpace(s) != "" {
			countdown = s
		}
	}
	nextLabel := ""
	if countdown != nil {
		if isZh {
			nextLabel = "下一节开始："
		} else {
			nextLabel = "NEXT SESSION IN:"
		}
	}

	pr := map[string]any{}
	if raceDay != nil {
		pr, _ = raceDay["preview_race"].(map[string]any)
	}
	prName := strings.TrimSpace(fmt.Sprintf("%v", pr["name"]))
	if !isZh {
		prName = strings.ToUpper(prName)
		if prName != "" && !strings.HasSuffix(prName, " GRAND PRIX") {
			prName = prName + " GRAND PRIX"
		}
	}
	nextGPText := ""
	if prName != "" && prName != gpName {
		if isZh {
			nextGPText = "下一站：" + prName
		} else {
			nextGPText = "NEXT: " + prName
		}
	}

	scheduleSrc := []any{}
	if raceDay != nil {
		if xs, ok := raceDay["schedule"].([]any); ok {
			scheduleSrc = xs
		}
	}
	for i := 0; i < len(scheduleSrc)/2; i++ {
		scheduleSrc[i], scheduleSrc[len(scheduleSrc)-1-i] = scheduleSrc[len(scheduleSrc)-1-i], scheduleSrc[i]
	}

	splitWhen := func(when string) (string, string) {
		parts := strings.Fields(when)
		if len(parts) >= 2 {
			return parts[0], parts[1]
		}
		if len(parts) == 1 {
			return parts[0], ""
		}
		return "", ""
	}
	statusTag := func(status string) string {
		if strings.ToUpper(strings.TrimSpace(status)) == "DONE" {
			if isZh {
				return "[完成]"
			}
			return "[DONE]"
		}
		return ""
	}

	weekdayShort := func(dt time.Time) string {
		if !isZh {
			return dt.In(tz).Format("Mon")
		}
		switch dt.In(tz).Weekday() {
		case time.Monday:
			return "周一"
		case time.Tuesday:
			return "周二"
		case time.Wednesday:
			return "周三"
		case time.Thursday:
			return "周四"
		case time.Friday:
			return "周五"
		case time.Saturday:
			return "周六"
		default:
			return "周日"
		}
	}

	scheduleTable := map[string]any{
		"title":   "SCHEDULE (Local Time)",
		"columns": []any{},
		"rows":    []any{},
	}
	if isZh {
		scheduleTable["title"] = "赛程（当地时间）"
	}
	rows := make([]any, 0, len(scheduleSrc))
	for _, it := range scheduleSrc {
		m, ok := it.(map[string]any)
		if !ok {
			continue
		}
		day, tm := splitWhen(fmt.Sprintf("%v", m["when"]))
		if isZh {
			if utc, ok := m["utc"].(string); ok && strings.TrimSpace(utc) != "" {
				if dt, err := time.Parse(time.RFC3339Nano, strings.ReplaceAll(utc, "Z", "+00:00")); err == nil {
					day = weekdayShort(dt)
					tm = dt.In(tz).Format("15:04")
				} else if dt, err := time.Parse(time.RFC3339, strings.ReplaceAll(utc, "Z", "+00:00")); err == nil {
					day = weekdayShort(dt)
					tm = dt.In(tz).Format("15:04")
				}
			}
		}
		rows = append(rows, map[string]any{
			"session":    fmt.Sprintf("%v:", m["key"]),
			"day":        day,
			"time":       tm,
			"status":     statusTag(fmt.Sprintf("%v", m["status"])),
			"status_raw": m["status"],
			"utc":        m["utc"],
		})
	}
	scheduleTable["rows"] = rows

	weatherObj := map[string]any{}
	if raceDay != nil {
		weatherObj, _ = raceDay["weather"].(map[string]any)
	}
	airC := weatherObj["air_c"]
	trackC := weatherObj["track_c"]
	tyre := any(nil)
	if raceDay != nil {
		tyre = raceDay["tyre"]
	}
	tyreText := "C1, C2, C3"
	if s, ok := tyre.(string); ok && strings.TrimSpace(s) != "" {
		tyreText = s
	} else if m, ok := tyre.(map[string]any); ok {
		if s, ok := m["text"].(string); ok && strings.TrimSpace(s) != "" {
			tyreText = s
		}
	}
	fmtTemp := func(v any) string {
		if f, ok := toFloat64(v); ok {
			return fmt.Sprintf("%d°C", int(f+0.5))
		}
		return "--"
	}
	fmtPct := func(v any) string {
		if f, ok := toFloat64(v); ok {
			return fmt.Sprintf("%d%%", int(f+0.5))
		}
		return "--"
	}
	fmtHpa := func(v any) string {
		if f, ok := toFloat64(v); ok {
			return fmt.Sprintf("%dhPa", int(f+0.5))
		}
		return "--"
	}
	fmtMs := func(v any) string {
		if f, ok := toFloat64(v); ok {
			return fmt.Sprintf("%.1fm/s", f)
		}
		return "--"
	}
	fmtDeg := func(v any) string {
		if f, ok := toFloat64(v); ok {
			return fmt.Sprintf("%d°", int(f+0.5))
		}
		return "--"
	}

	weatherKV := map[string]any{
		"title":   "WEATHER",
		"columns": []any{},
		"rows":    []any{},
	}
	rowsW := make([]any, 0, 8)
	rowsW = append(rowsW, map[string]any{"k": "AIR:", "v": fmtTemp(airC)})
	rowsW = append(rowsW, map[string]any{"k": "TRACK:", "v": fmtTemp(trackC)})
	if weatherObj != nil {
		rowsW = append(rowsW, map[string]any{"k": "HUMID:", "v": fmtPct(weatherObj["humidity"])})
		rowsW = append(rowsW, map[string]any{"k": "PRESS:", "v": fmtHpa(weatherObj["pressure"])})
		rowsW = append(rowsW, map[string]any{"k": "RAIN:", "v": fmt.Sprintf("%v", weatherObj["rainfall"])})
		rowsW = append(rowsW, map[string]any{"k": "WIND:", "v": fmtMs(weatherObj["wind_speed"])})
		rowsW = append(rowsW, map[string]any{"k": "W DIR:", "v": fmtDeg(weatherObj["wind_direction"])})
	}
	rowsW = append(rowsW, map[string]any{"k": "TYRE:", "v": tyreText})
	weatherKV["rows"] = rowsW
	if isZh {
		weatherKV["title"] = "天气"
		rowsZh := make([]any, 0, 8)
		rowsZh = append(rowsZh, map[string]any{"k": "气温：", "v": fmtTemp(airC)})
		rowsZh = append(rowsZh, map[string]any{"k": "赛道：", "v": fmtTemp(trackC)})
		if weatherObj != nil {
			rowsZh = append(rowsZh, map[string]any{"k": "湿度：", "v": fmtPct(weatherObj["humidity"])})
			rowsZh = append(rowsZh, map[string]any{"k": "气压：", "v": fmtHpa(weatherObj["pressure"])})
			rowsZh = append(rowsZh, map[string]any{"k": "降雨：", "v": fmt.Sprintf("%v", weatherObj["rainfall"])})
			rowsZh = append(rowsZh, map[string]any{"k": "风速：", "v": fmtMs(weatherObj["wind_speed"])})
			rowsZh = append(rowsZh, map[string]any{"k": "风向：", "v": fmtDeg(weatherObj["wind_direction"])})
		}
		rowsZh = append(rowsZh, map[string]any{"k": "轮胎：", "v": tyreText})
		weatherKV["rows"] = rowsZh
	}

	raceDayUI := map[string]any{
		"race":         map[string]any{"grand_prix": gpName, "round": roundText},
		"next_session": map[string]any{"label": nextLabel, "countdown": countdown},
		"next_gp":      map[string]any{"text": nextGPText},
		"schedule":     scheduleTable,
		"weather":      weatherKV,
		"circuit":      anyField(raceDay, "circuit"),
	}

	drivers := []any{}
	constructors := []any{}
	driversAll := []any{}
	constructorsAll := []any{}
	news := any(nil)
	header2 := map[string]any{}
	if offWeek != nil {
		if xs, ok := offWeek["drivers"].([]any); ok {
			drivers = xs
		}
		if xs, ok := offWeek["constructors"].([]any); ok {
			constructors = xs
		}
		if xs, ok := offWeek["drivers_all"].([]any); ok {
			driversAll = xs
		}
		if xs, ok := offWeek["constructors_all"].([]any); ok {
			constructorsAll = xs
		}
		news = offWeek["news"]
		header2, _ = offWeek["header"].(map[string]any)
	}
	daysToNext := header2["days_to_next"]
	until := header2["until"]

	offWeekUI := map[string]any{
		"header": map[string]any{
			"left":  fmt.Sprintf("%d F1 SEASON STANDINGS", season),
			"right": "DAYS TO NEXT",
		},
		"days": map[string]any{
			"value": daysToNext,
			"unit":  "DAYS",
			"until": until,
		},
		"drivers_table": map[string]any{
			"columns": []any{},
			"rows":    buildDriversTableRows(drivers),
		},
		"constructors_table": map[string]any{
			"columns": []any{},
			"rows":    buildConstructorsTableRows(constructors),
		},
		"news": news,
	}
	if isZh {
		offWeekUI["header"] = map[string]any{
			"left":  fmt.Sprintf("%d 赛季积分榜", season),
			"right": "距离下一站",
		}
		offWeekUI["days"] = map[string]any{
			"value": daysToNext,
			"unit":  "天",
			"until": until,
		}
	}

	details := buildDetails(pagesPayload, driversAll, constructorsAll, season)

	decisionTZ := "Asia/Shanghai"
	shLoc, err := time.LoadLocation(decisionTZ)
	if err != nil {
		shLoc = time.UTC
		decisionTZ = "UTC"
	}
	isRaceWeek := false
	nowSh := nowUTC.In(shLoc)
	rr := map[string]any{}
	if raceDay != nil {
		rr, _ = raceDay["next_race"].(map[string]any)
	}
	if rr != nil {
		if s, ok := rr["starts_at_utc"].(string); ok && strings.TrimSpace(s) != "" {
			raceDt, err := time.Parse(time.RFC3339Nano, strings.ReplaceAll(s, "Z", "+00:00"))
			if err != nil {
				raceDt, err = time.Parse(time.RFC3339, strings.ReplaceAll(s, "Z", "+00:00"))
			}
			if err == nil {
				raceDtSh := raceDt.In(shLoc)
				wdGo := int(raceDtSh.Weekday())
				pyWd := (wdGo + 6) % 7
				backDays := pyWd
				if backDays == 0 {
					backDays = 7
				}
				startD := time.Date(raceDtSh.Year(), raceDtSh.Month(), raceDtSh.Day(), 0, 0, 0, 0, shLoc).AddDate(0, 0, -backDays)
				if !nowSh.Before(startD) && !nowSh.After(raceDtSh) {
					isRaceWeek = true
				}
			}
		}
	}
	defaultPage := "off_week"
	if isRaceWeek {
		defaultPage = "race_day"
		if ng, ok := raceDayUI["next_gp"].(map[string]any); ok {
			ng["text"] = ""
		}
	}

	return map[string]any{
		"generated_at_utc": pagesPayload["generated_at_utc"],
		"tz":               tzName,
		"format":           "ui.v1",
		"sources":          pagesPayload["sources"],
		"decision_tz":      decisionTZ,
		"is_race_week":     isRaceWeek,
		"default_page":     defaultPage,
		"details":          details,
		"pages":            map[string]any{"race_day": raceDayUI, "off_week": offWeekUI},
		"now_fallback":     nowUTC.In(tz).Format("15:04"),
	}
}

func buildDriversTableRows(drivers []any) []any {
	out := make([]any, 0, len(drivers))
	for _, d := range drivers {
		m, ok := d.(map[string]any)
		if !ok {
			continue
		}
		out = append(out, map[string]any{
			"pos":    m["pos"],
			"name":   m["name"],
			"code":   m["code"],
			"points": m["points"],
		})
	}
	return out
}

func buildConstructorsTableRows(constructors []any) []any {
	out := make([]any, 0, len(constructors))
	for _, c := range constructors {
		m, ok := c.(map[string]any)
		if !ok {
			continue
		}
		out = append(out, map[string]any{
			"pos":    m["pos"],
			"name":   m["name"],
			"points": m["points"],
		})
	}
	return out
}

func buildDetails(pagesPayload map[string]any, driversAll []any, constructorsAll []any, season int) map[string]any {
	trends := trendMap(pagesPayload)

	wdcRows := make([]any, 0, len(driversAll))
	for _, d := range driversAll {
		m, ok := d.(map[string]any)
		if !ok {
			continue
		}
		driverID := fmt.Sprintf("%v", m["driver_id"])
		t := trends[driverID]
		if len(t) == 0 {
			t = []string{".", ".", ".", ".", "."}
		}
		wdcRows = append(wdcRows, map[string]any{
			"pos":    m["pos"],
			"driver": m["name"],
			"team":   m["constructor"],
			"points": m["points"],
			"trend":  "[ " + strings.Join(t, " ") + " ]",
		})
	}
	wdcPages := chunkPages(wdcRows, 8)

	leaderPts := any(nil)
	if len(constructorsAll) > 0 {
		if m, ok := constructorsAll[0].(map[string]any); ok {
			leaderPts = m["points"]
		}
	}

	byTeam := map[string][]map[string]any{}
	for _, d := range driversAll {
		m, ok := d.(map[string]any)
		if !ok {
			continue
		}
		cid := strings.TrimSpace(fmt.Sprintf("%v", m["constructor_id"]))
		if cid == "" || cid == "<nil>" {
			continue
		}
		byTeam[cid] = append(byTeam[cid], m)
	}

	wccRows := make([]any, 0, len(constructorsAll))
	leaderInt, _ := toInt(leaderPts)
	for _, c := range constructorsAll {
		m, ok := c.(map[string]any)
		if !ok {
			continue
		}
		ptsInt, _ := toInt(m["points"])
		gap := ""
		if leaderInt != 0 && ptsInt != 0 {
			gap = strconv.Itoa(ptsInt - leaderInt)
		}
		if toIntDefault(m["pos"]) == 1 {
			gap = "--"
		}
		cid := strings.TrimSpace(fmt.Sprintf("%v", m["constructor_id"]))
		drivers := byTeam[cid]
		sortDriverPointsDesc(drivers)
		p1 := 0
		p2 := 0
		if len(drivers) > 0 {
			p1 = toIntDefault(drivers[0]["points"])
		}
		if len(drivers) > 1 {
			p2 = toIntDefault(drivers[1]["points"])
		}
		total := p1 + p2
		barN := 12
		fill := 0
		if total > 0 {
			fill = int(float64(p1)/float64(total)*float64(barN) + 0.5)
		}
		if fill < 0 {
			fill = 0
		}
		if fill > barN {
			fill = barN
		}
		bar := "[" + strings.Repeat("=", fill) + strings.Repeat(" ", barN-fill) + "]"
		wccRows = append(wccRows, map[string]any{
			"pos":         m["pos"],
			"constructor": m["name"],
			"points":      m["points"],
			"gap":         gap,
			"split_bar":   bar,
			"split_value": fmt.Sprintf("%d/%d", p1, p2),
		})
	}
	wccPages := chunkPages(wccRows, 8)

	return map[string]any{
		"wdc": map[string]any{
			"title":     fmt.Sprintf("%d DRIVER STANDINGS (WDC)", season),
			"page_size": 8,
			"pages":     wdcPages,
		},
		"wcc": map[string]any{
			"title":     fmt.Sprintf("%d CONSTRUCTOR STANDINGS (WCC)", season),
			"page_size": 8,
			"pages":     wccPages,
		},
	}
}

func chunkPages(rows []any, pageSize int) []any {
	if pageSize <= 0 {
		return []any{map[string]any{"page": 1, "page_count": 1, "rows": rows}}
	}
	pages := make([]any, 0, (len(rows)+pageSize-1)/pageSize)
	for i := 0; i < len(rows); i += pageSize {
		end := i + pageSize
		if end > len(rows) {
			end = len(rows)
		}
		pages = append(pages, map[string]any{
			"page":       (i / pageSize) + 1,
			"page_count": (len(rows) + pageSize - 1) / pageSize,
			"rows":       rows[i:end],
		})
	}
	return pages
}

func trendMap(pagesPayload map[string]any) map[string][]string {
	out := map[string][]string{}
	last, _ := pagesPayload["last_results"].(map[string]any)
	races, _ := last["races"].([]any)
	for _, r := range races {
		rm, ok := r.(map[string]any)
		if !ok {
			continue
		}
		results, _ := rm["Results"].([]any)
		for _, res := range results {
			m, ok := res.(map[string]any)
			if !ok {
				continue
			}
			drv, _ := m["Driver"].(map[string]any)
			driverID := strings.TrimSpace(fmt.Sprintf("%v", drv["driverId"]))
			if driverID == "" || driverID == "<nil>" {
				continue
			}
			pos := toIntDefault(m["position"])
			pts, _ := toFloat64(m["points"])
			sym := "."
			if pos > 0 && pos <= 3 {
				sym = "#"
			} else if pts > 0 {
				sym = "o"
			}
			out[driverID] = append(out[driverID], sym)
		}
	}
	for k, v := range out {
		if len(v) < 5 {
			pad := make([]string, 0, 5)
			for i := 0; i < 5-len(v); i++ {
				pad = append(pad, ".")
			}
			pad = append(pad, v...)
			out[k] = pad
		} else if len(v) > 5 {
			out[k] = v[len(v)-5:]
		}
	}
	return out
}

func sortDriverPointsDesc(rows []map[string]any) {
	for i := 0; i < len(rows); i++ {
		for j := i + 1; j < len(rows); j++ {
			if toIntDefault(rows[j]["points"]) > toIntDefault(rows[i]["points"]) {
				rows[i], rows[j] = rows[j], rows[i]
			}
		}
	}
}
