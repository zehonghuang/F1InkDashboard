package f1db

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"gorm.io/gorm"
)

func OpenF1LatestRaceSessionKey(db *gorm.DB, season int) (int, error) {
	type row struct {
		SessionKey int `gorm:"column:session_key"`
	}
	var r row
	err := db.Raw(`
            SELECT s.session_key
            FROM openf1_sessions s
            WHERE s.year = ?
              AND s.is_cancelled IS NOT TRUE
              AND (LOWER(s.session_name) = 'race' OR LOWER(s.session_type) = 'race')
              AND EXISTS (
                SELECT 1
                FROM openf1_championship_drivers cd
                WHERE cd.session_key = s.session_key
              )
            ORDER BY s.date_start_utc DESC
            LIMIT 1
        `, season).Scan(&r).Error
	if err == nil && r.SessionKey != 0 {
		return r.SessionKey, nil
	}

	r = row{}
	err2 := db.Raw(`
            SELECT s.session_key
            FROM openf1_sessions s
            WHERE s.year = ?
              AND EXISTS (
                SELECT 1
                FROM openf1_championship_drivers cd
                WHERE cd.session_key = s.session_key
              )
            ORDER BY s.date_start_utc DESC
            LIMIT 1
        `, season).Scan(&r).Error
	if err2 != nil {
		return 0, err2
	}
	if r.SessionKey == 0 {
		return 0, errors.New("no_openf1_championship_data")
	}
	return r.SessionKey, nil
}

func OpenF1DriverStandingsJSON(db *gorm.DB, sessionKey int, lang string) (map[string]any, error) {
	type row struct {
		DriverNumber    int     `gorm:"column:driver_number"`
		PositionCurrent int     `gorm:"column:position_current"`
		PointsCurrent   float64 `gorm:"column:points_current"`
		FirstName       string  `gorm:"column:first_name"`
		LastName        string  `gorm:"column:last_name"`
		NameAcronym     string  `gorm:"column:name_acronym"`
		TeamName        *string `gorm:"column:team_name"`
	}
	var rows []row
	if err := db.Raw(`
            SELECT
              cd.driver_number,
              cd.position_current,
              cd.points_current,
              d.first_name,
              d.last_name,
              d.name_acronym,
              d.team_name
            FROM openf1_championship_drivers cd
            LEFT JOIN openf1_drivers d
              ON d.session_key = cd.session_key AND d.driver_number = cd.driver_number
            WHERE cd.session_key = ?
            ORDER BY cd.position_current ASC
        `, sessionKey).Scan(&rows).Error; err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, errors.New("no_driver_standings")
	}

	constructorID := func(teamName string) string {
		s := strings.TrimSpace(strings.ToLower(teamName))
		if s == "" {
			return ""
		}
		s = strings.ReplaceAll(s, "&", "and")
		s = strings.ReplaceAll(s, " ", "_")
		if len(s) > 48 {
			s = s[:48]
		}
		return s
	}

	driverKeys := make([]string, 0, len(rows))
	for _, it := range rows {
		if it.DriverNumber <= 0 {
			continue
		}
		driverKeys = append(driverKeys, strconv.Itoa(it.DriverNumber))
	}
	driverFullNameMap, _ := fetchI18nText(db, lang, "driver", "full_name", driverKeys)

	consKeys := make([]string, 0, len(rows))
	for _, it := range rows {
		if it.TeamName == nil || strings.TrimSpace(*it.TeamName) == "" {
			continue
		}
		consKeys = append(consKeys, constructorID(*it.TeamName))
	}
	consNameMap, _ := fetchI18nText(db, lang, "constructor", "name", consKeys)

	drivers := make([]any, 0, len(rows))
	for _, it := range rows {
		driverID := strconv.Itoa(it.DriverNumber)
		drv := map[string]any{
			"driverId":   driverID,
			"code":       strings.ToUpper(strings.TrimSpace(it.NameAcronym)),
			"givenName":  strings.TrimSpace(it.FirstName),
			"familyName": strings.TrimSpace(it.LastName),
		}
		if v, ok := driverFullNameMap[driverID]; ok && strings.TrimSpace(v) != "" {
			drv["displayName"] = strings.TrimSpace(v)
		}
		constructors := make([]any, 0, 1)
		if it.TeamName != nil && strings.TrimSpace(*it.TeamName) != "" {
			cid := constructorID(*it.TeamName)
			teamName := strings.TrimSpace(*it.TeamName)
			if v, ok := consNameMap[cid]; ok && strings.TrimSpace(v) != "" {
				teamName = strings.TrimSpace(v)
			}
			constructors = append(constructors, map[string]any{
				"constructorId": cid,
				"name":          teamName,
			})
		}
		drivers = append(drivers, map[string]any{
			"position":     it.PositionCurrent,
			"points":       it.PointsCurrent,
			"Driver":       drv,
			"Constructors": constructors,
		})
	}

	return map[string]any{
		"MRData": map[string]any{
			"series": "f1",
			"url":    fmt.Sprintf("mysql://toinc_F1/openf1_championship_drivers?session_key=%d", sessionKey),
			"StandingsTable": map[string]any{
				"StandingsLists": []any{
					map[string]any{"DriverStandings": drivers},
				},
			},
		},
	}, nil
}

func OpenF1ConstructorStandingsJSON(db *gorm.DB, sessionKey int, lang string) (map[string]any, error) {
	type row struct {
		TeamName        string  `gorm:"column:team_name"`
		PositionCurrent int     `gorm:"column:position_current"`
		PointsCurrent   float64 `gorm:"column:points_current"`
	}
	var rows []row
	if err := db.Raw(`
            SELECT
              team_name,
              position_current,
              points_current
            FROM openf1_championship_teams
            WHERE session_key = ?
            ORDER BY position_current ASC
        `, sessionKey).Scan(&rows).Error; err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, errors.New("no_constructor_standings")
	}

	constructorID := func(teamName string) string {
		s := strings.TrimSpace(strings.ToLower(teamName))
		if s == "" {
			return ""
		}
		s = strings.ReplaceAll(s, "&", "and")
		s = strings.ReplaceAll(s, " ", "_")
		if len(s) > 48 {
			s = s[:48]
		}
		return s
	}

	consKeys := make([]string, 0, len(rows))
	for _, it := range rows {
		if strings.TrimSpace(it.TeamName) == "" {
			continue
		}
		consKeys = append(consKeys, constructorID(it.TeamName))
	}
	consNameMap, _ := fetchI18nText(db, lang, "constructor", "name", consKeys)

	out := make([]any, 0, len(rows))
	for _, it := range rows {
		cid := constructorID(it.TeamName)
		teamName := strings.TrimSpace(it.TeamName)
		if v, ok := consNameMap[cid]; ok && strings.TrimSpace(v) != "" {
			teamName = strings.TrimSpace(v)
		}
		out = append(out, map[string]any{
			"position": it.PositionCurrent,
			"points":   it.PointsCurrent,
			"Constructor": map[string]any{
				"constructorId": cid,
				"name":          teamName,
			},
		})
	}

	return map[string]any{
		"MRData": map[string]any{
			"series": "f1",
			"url":    fmt.Sprintf("mysql://toinc_F1/openf1_championship_teams?session_key=%d", sessionKey),
			"StandingsTable": map[string]any{
				"StandingsLists": []any{
					map[string]any{"ConstructorStandings": out},
				},
			},
		},
	}, nil
}

func OpenF1LastNResultsJSON(db *gorm.DB, season int, n int, lang string) (map[string]any, error) {
	if n <= 0 {
		return map[string]any{
			"MRData": map[string]any{
				"series": "f1",
				"url":    "mysql://toinc_F1/openf1_session_result",
				"RaceTable": map[string]any{
					"season": strconv.Itoa(season),
					"Races":  []any{},
				},
			},
		}, nil
	}

	type sessRow struct {
		SessionKey   int       `gorm:"column:session_key"`
		DateStartUTC time.Time `gorm:"column:date_start_utc"`
		MeetingKey   int       `gorm:"column:meeting_key"`
		MeetingName  string    `gorm:"column:meeting_name"`
	}
	var sess []sessRow
	if err := db.Raw(`
            SELECT
              s.session_key,
              s.meeting_key,
              s.date_start_utc,
              COALESCE(m.meeting_name, '') AS meeting_name
            FROM openf1_sessions s
            LEFT JOIN openf1_meetings m ON m.meeting_key = s.meeting_key
            WHERE s.year = ?
              AND s.is_cancelled IS NOT TRUE
              AND (LOWER(s.session_name) = 'race' OR LOWER(s.session_type) = 'race')
              AND EXISTS (
                SELECT 1
                FROM openf1_session_result sr
                WHERE sr.session_key = s.session_key
              )
            ORDER BY s.date_start_utc DESC
            LIMIT ?
        `, season, n).Scan(&sess).Error; err != nil {
		return nil, err
	}
	if len(sess) == 0 {
		return map[string]any{
			"MRData": map[string]any{
				"series": "f1",
				"url":    "mysql://toinc_F1/openf1_session_result",
				"RaceTable": map[string]any{
					"season": strconv.Itoa(season),
					"Races":  []any{},
				},
			},
		}, nil
	}

	sessionKeys := make([]int, 0, len(sess))
	meta := map[int]sessRow{}
	for _, it := range sess {
		sessionKeys = append(sessionKeys, it.SessionKey)
		meta[it.SessionKey] = it
	}

	meetingKeys := make([]string, 0, len(sess))
	for _, it := range sess {
		if it.MeetingKey <= 0 {
			continue
		}
		meetingKeys = append(meetingKeys, strconv.Itoa(it.MeetingKey))
	}
	meetingNameMap, _ := fetchI18nText(db, lang, "openf1_meeting", "meeting_name", meetingKeys)
	sessionKeys = uniqInts(sessionKeys)
	sort.Ints(sessionKeys)

	type resRow struct {
		SessionKey    int      `gorm:"column:session_key"`
		DriverNumber  int      `gorm:"column:driver_number"`
		Position      int      `gorm:"column:position"`
		PointsStart   *float64 `gorm:"column:points_start"`
		PointsCurrent *float64 `gorm:"column:points_current"`
	}
	var res []resRow
	if err := db.Raw(`
            SELECT
              sr.session_key,
              sr.driver_number,
              sr.position,
              cd.points_start,
              cd.points_current
            FROM openf1_session_result sr
            LEFT JOIN openf1_championship_drivers cd
              ON cd.session_key = sr.session_key AND cd.driver_number = sr.driver_number
            WHERE sr.session_key IN (?)
        `, sessionKeys).Scan(&res).Error; err != nil {
		return nil, err
	}

	bySession := map[int][]map[string]any{}
	for _, sk := range sessionKeys {
		bySession[sk] = []map[string]any{}
	}
	for _, it := range res {
		pts := 0.0
		if it.PointsStart != nil && it.PointsCurrent != nil {
			pts = *it.PointsCurrent - *it.PointsStart
		}
		bySession[it.SessionKey] = append(bySession[it.SessionKey], map[string]any{
			"dn":     it.DriverNumber,
			"pos":    it.Position,
			"points": pts,
		})
	}

	races := make([]any, 0, len(sessionKeys))
	for _, sk := range sessionKeys {
		m := meta[sk]
		name := strings.TrimSpace(m.MeetingName)
		if m.MeetingKey > 0 {
			if v, ok := meetingNameMap[strconv.Itoa(m.MeetingKey)]; ok && strings.TrimSpace(v) != "" {
				name = strings.TrimSpace(v)
			}
		}
		if name == "" {
			name = fmt.Sprintf("SESSION %d", sk)
		}
		results := bySession[sk]
		sortByPos(results)
		outRes := make([]any, 0, len(results))
		for _, r := range results {
			pos := r["pos"].(int)
			dn := r["dn"].(int)
			outRes = append(outRes, map[string]any{
				"position": strconv.Itoa(pos),
				"points":   r["points"].(float64),
				"Driver":   map[string]any{"driverId": strconv.Itoa(dn)},
			})
		}
		races = append(races, map[string]any{
			"season":   strconv.Itoa(season),
			"round":    nil,
			"raceName": name,
			"Results":  outRes,
		})
	}

	return map[string]any{
		"MRData": map[string]any{
			"series": "f1",
			"url":    fmt.Sprintf("mysql://toinc_F1/openf1_session_result?season=%d&n=%d", season, n),
			"RaceTable": map[string]any{
				"season": strconv.Itoa(season),
				"Races":  races,
			},
		},
	}, nil
}

func uniqInts(in []int) []int {
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

func sortByPos(rows []map[string]any) {
	for i := 0; i < len(rows); i++ {
		for j := i + 1; j < len(rows); j++ {
			pi, _ := rows[i]["pos"].(int)
			pj, _ := rows[j]["pos"].(int)
			if pj < pi {
				rows[i], rows[j] = rows[j], rows[i]
			}
		}
	}
}

func OpenF1SessionResultRows(db *gorm.DB, sessionKey int) ([]map[string]any, error) {
	var rows []map[string]any
	if err := db.Raw(`
            SELECT
              sr.session_key,
              sr.meeting_key,
              sr.driver_number,
              sr.position,
              sr.number_of_laps,
              sr.dnf,
              sr.dns,
              sr.dsq,
              sr.duration_s,
              sr.gap_to_leader_s,
              sr.duration_json,
              sr.gap_to_leader_json,
              d.name_acronym,
              d.team_name,
              cd.points_start,
              cd.points_current
            FROM openf1_session_result sr
            LEFT JOIN openf1_drivers d
              ON d.session_key = sr.session_key AND d.driver_number = sr.driver_number
            LEFT JOIN openf1_championship_drivers cd
              ON cd.session_key = sr.session_key AND cd.driver_number = sr.driver_number
            WHERE sr.session_key = ?
            ORDER BY sr.position ASC
        `, sessionKey).Scan(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}

func OpenF1PitCounts(db *gorm.DB, sessionKey int) (map[int]int, error) {
	type row struct {
		DriverNumber int `gorm:"column:driver_number"`
		N            int `gorm:"column:n"`
	}
	var rows []row
	if err := db.Raw(`
            SELECT driver_number, COUNT(*) AS n
            FROM openf1_pit
            WHERE session_key = ?
            GROUP BY driver_number
        `, sessionKey).Scan(&rows).Error; err != nil {
		return nil, err
	}
	out := map[int]int{}
	for _, it := range rows {
		out[it.DriverNumber] = it.N
	}
	return out, nil
}

func OpenF1QualiSec123(db *gorm.DB, sessionKey int) (map[int]string, error) {
	type gbRow struct {
		Gb1 *float64 `gorm:"column:gb1"`
		Gb2 *float64 `gorm:"column:gb2"`
		Gb3 *float64 `gorm:"column:gb3"`
	}
	var gb gbRow
	if err := db.Raw(`
            SELECT
              MIN(duration_sector_1) AS gb1,
              MIN(duration_sector_2) AS gb2,
              MIN(duration_sector_3) AS gb3
            FROM openf1_laps
            WHERE session_key = ?
              AND lap_duration IS NOT NULL
              AND (is_pit_out_lap = 0 OR is_pit_out_lap IS NULL)
        `, sessionKey).Scan(&gb).Error; err != nil {
		return nil, err
	}

	type pbRow struct {
		DriverNumber int      `gorm:"column:driver_number"`
		Pb1          *float64 `gorm:"column:pb1"`
		Pb2          *float64 `gorm:"column:pb2"`
		Pb3          *float64 `gorm:"column:pb3"`
	}
	var pbRows []pbRow
	if err := db.Raw(`
            SELECT
              driver_number,
              MIN(duration_sector_1) AS pb1,
              MIN(duration_sector_2) AS pb2,
              MIN(duration_sector_3) AS pb3
            FROM openf1_laps
            WHERE session_key = ?
              AND lap_duration IS NOT NULL
              AND (is_pit_out_lap = 0 OR is_pit_out_lap IS NULL)
            GROUP BY driver_number
        `, sessionKey).Scan(&pbRows).Error; err != nil {
		return nil, err
	}
	pb := map[int][3]*float64{}
	for _, it := range pbRows {
		pb[it.DriverNumber] = [3]*float64{it.Pb1, it.Pb2, it.Pb3}
	}

	type bestRow struct {
		DriverNumber int      `gorm:"column:driver_number"`
		S1           *float64 `gorm:"column:s1"`
		S2           *float64 `gorm:"column:s2"`
		S3           *float64 `gorm:"column:s3"`
	}
	var bestRows []bestRow
	if err := db.Raw(`
            SELECT
              l.driver_number,
              l.duration_sector_1 AS s1,
              l.duration_sector_2 AS s2,
              l.duration_sector_3 AS s3
            FROM openf1_laps l
            JOIN (
              SELECT driver_number, MIN(lap_duration) AS best_dur
              FROM openf1_laps
              WHERE session_key = ?
                AND lap_duration IS NOT NULL
                AND (is_pit_out_lap = 0 OR is_pit_out_lap IS NULL)
              GROUP BY driver_number
            ) b
              ON b.driver_number = l.driver_number AND b.best_dur = l.lap_duration
            WHERE l.session_key = ?
              AND (l.is_pit_out_lap = 0 OR l.is_pit_out_lap IS NULL)
        `, sessionKey, sessionKey).Scan(&bestRows).Error; err != nil {
		return nil, err
	}
	best := map[int][3]*float64{}
	for _, it := range bestRows {
		if _, ok := best[it.DriverNumber]; ok {
			continue
		}
		best[it.DriverNumber] = [3]*float64{it.S1, it.S2, it.S3}
	}

	eps := 0.0015
	sym := func(v, g, p *float64) string {
		if v == nil || !(*v > 0) {
			return "-"
		}
		if g != nil && abs(*v-*g) <= eps {
			return "P"
		}
		if p != nil && abs(*v-*p) <= eps {
			return "G"
		}
		return "Y"
	}

	out := map[int]string{}
	for dn, s := range best {
		p := pb[dn]
		out[dn] = sym(s[0], gb.Gb1, p[0]) + sym(s[1], gb.Gb2, p[1]) + sym(s[2], gb.Gb3, p[2])
	}
	return out, nil
}

func abs(v float64) float64 {
	if v < 0 {
		return -v
	}
	return v
}

func OpenF1ScheduleJSON(db *gorm.DB, season int, lang string) (map[string]any, error) {
	type meetingRow struct {
		MeetingKey       int        `gorm:"column:meeting_key"`
		Year             int        `gorm:"column:year"`
		MeetingName      string     `gorm:"column:meeting_name"`
		Location         *string    `gorm:"column:location"`
		CountryName      *string    `gorm:"column:country_name"`
		CircuitShortName *string    `gorm:"column:circuit_short_name"`
		DateStartUTC     *time.Time `gorm:"column:date_start_utc"`
		IsCancelled      *bool      `gorm:"column:is_cancelled"`
	}
	type sessionRow struct {
		SessionKey   int        `gorm:"column:session_key"`
		MeetingKey   int        `gorm:"column:meeting_key"`
		Year         int        `gorm:"column:year"`
		SessionName  *string    `gorm:"column:session_name"`
		SessionType  *string    `gorm:"column:session_type"`
		DateStartUTC *time.Time `gorm:"column:date_start_utc"`
		IsCancelled  *bool      `gorm:"column:is_cancelled"`
	}

	var meetings []meetingRow
	if err := db.Raw(`
            SELECT
              meeting_key,
              year,
              meeting_name,
              location,
              country_name,
              circuit_short_name,
              date_start_utc,
              is_cancelled
            FROM openf1_meetings
            WHERE year = ?
        `, season).Scan(&meetings).Error; err != nil {
		return nil, err
	}
	var sessions []sessionRow
	if err := db.Raw(`
            SELECT
              session_key,
              meeting_key,
              year,
              session_name,
              session_type,
              date_start_utc,
              is_cancelled
            FROM openf1_sessions
            WHERE year = ?
        `, season).Scan(&sessions).Error; err != nil {
		return nil, err
	}
	if len(sessions) == 0 {
		return nil, errors.New("no_openf1_sessions")
	}

	meetingsByKey := map[int]meetingRow{}
	meetingKeys := make([]string, 0, len(meetings))
	for _, m := range meetings {
		meetingsByKey[m.MeetingKey] = m
		if m.MeetingKey > 0 {
			meetingKeys = append(meetingKeys, strconv.Itoa(m.MeetingKey))
		}
	}
	meetingNameMap, _ := fetchI18nText(db, lang, "openf1_meeting", "meeting_name", meetingKeys)
	meetingLocationMap, _ := fetchI18nText(db, lang, "openf1_meeting", "location", meetingKeys)
	meetingCountryMap, _ := fetchI18nText(db, lang, "openf1_meeting", "country_name", meetingKeys)
	meetingCircuitShortMap, _ := fetchI18nText(db, lang, "openf1_meeting", "circuit_short_name", meetingKeys)

	mapSessionType := func(name string) string {
		s := strings.TrimSpace(strings.ToLower(name))
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

	type sessInfo struct {
		Dt         time.Time
		SessionKey int
	}
	byMeeting := map[int]map[string]sessInfo{}
	byMeetingAnyDt := map[int]time.Time{}
	for _, s := range sessions {
		if s.DateStartUTC == nil {
			continue
		}
		dt := (*s.DateStartUTC).UTC()
		st := ""
		if s.SessionName != nil {
			st = mapSessionType(*s.SessionName)
		}
		if st == "" && s.SessionType != nil {
			st = mapSessionType(*s.SessionType)
		}
		if st != "" {
			if _, ok := byMeeting[s.MeetingKey]; !ok {
				byMeeting[s.MeetingKey] = map[string]sessInfo{}
			}
			byMeeting[s.MeetingKey][st] = sessInfo{Dt: dt, SessionKey: s.SessionKey}
		}
		if prev, ok := byMeetingAnyDt[s.MeetingKey]; !ok || dt.Before(prev) {
			byMeetingAnyDt[s.MeetingKey] = dt
		}
	}

	type raceTmp struct {
		Dt  time.Time
		Obj map[string]any
	}
	tmp := make([]raceTmp, 0, len(byMeeting))
	for mk, sessMap := range byMeeting {
		raceRec, ok := sessMap["RACE"]
		raceDt := time.Time{}
		if ok {
			raceDt = raceRec.Dt
		} else if dt, ok := byMeetingAnyDt[mk]; ok {
			raceDt = dt
		} else {
			continue
		}
		dateS, timeS := dtToErgastParts(raceDt)
		if dateS == "" {
			continue
		}
		m := meetingsByKey[mk]
		raceName := strings.TrimSpace(m.MeetingName)
		if v, ok := meetingNameMap[strconv.Itoa(mk)]; ok && strings.TrimSpace(v) != "" {
			raceName = strings.TrimSpace(v)
		}
		if raceName == "" {
			raceName = fmt.Sprintf("MEETING %d", mk)
		}

		loc := map[string]any{
			"lat":      nil,
			"long":     nil,
			"locality": nil,
			"country":  nil,
		}
		if m.Location != nil {
			locality := strings.TrimSpace(*m.Location)
			if v, ok := meetingLocationMap[strconv.Itoa(mk)]; ok && strings.TrimSpace(v) != "" {
				locality = strings.TrimSpace(v)
			}
			loc["locality"] = locality
		}
		if m.CountryName != nil {
			country := strings.TrimSpace(*m.CountryName)
			if v, ok := meetingCountryMap[strconv.Itoa(mk)]; ok && strings.TrimSpace(v) != "" {
				country = strings.TrimSpace(v)
			}
			loc["country"] = country
		}
		circuit := map[string]any{
			"url":         nil,
			"circuitName": nil,
			"Location":    loc,
		}
		if m.CircuitShortName != nil && strings.TrimSpace(*m.CircuitShortName) != "" {
			circuitName := strings.TrimSpace(*m.CircuitShortName)
			if v, ok := meetingCircuitShortMap[strconv.Itoa(mk)]; ok && strings.TrimSpace(v) != "" {
				circuitName = strings.TrimSpace(v)
			}
			circuit["circuitName"] = circuitName
		}

		raceObj := map[string]any{
			"season":   strconv.Itoa(season),
			"round":    nil,
			"url":      nil,
			"raceName": raceName,
			"Circuit":  circuit,
			"date":     dateS,
		}
		if timeS != "" {
			raceObj["time"] = timeS
		}
		if ok {
			raceObj["openf1_race_session_key"] = raceRec.SessionKey
		}

		addSess := func(key, field string) {
			if rec, ok := sessMap[key]; ok {
				dateS, timeS := dtToErgastParts(rec.Dt)
				if dateS == "" {
					return
				}
				o := map[string]any{"date": dateS}
				if timeS != "" {
					o["time"] = timeS
				}
				o["openf1_session_key"] = rec.SessionKey
				raceObj[field] = o
			}
		}
		addSess("FP1", "FirstPractice")
		addSess("FP2", "SecondPractice")
		addSess("FP3", "ThirdPractice")
		addSess("Q", "Qualifying")
		addSess("SQ", "SprintQualifying")
		addSess("SPRINT", "Sprint")

		tmp = append(tmp, raceTmp{Dt: raceDt, Obj: raceObj})
	}
	if len(tmp) == 0 {
		return nil, errors.New("no_openf1_races_derived")
	}
	for i := 0; i < len(tmp); i++ {
		for j := i + 1; j < len(tmp); j++ {
			if tmp[j].Dt.Before(tmp[i].Dt) {
				tmp[i], tmp[j] = tmp[j], tmp[i]
			}
		}
	}
	races := make([]any, 0, len(tmp))
	for i, it := range tmp {
		it.Obj["round"] = strconv.Itoa(i + 1)
		races = append(races, it.Obj)
	}

	return map[string]any{
		"MRData": map[string]any{
			"series": "f1",
			"url":    fmt.Sprintf("mysql://toinc_F1/openf1_sessions?season=%d", season),
			"RaceTable": map[string]any{
				"season": strconv.Itoa(season),
				"Races":  races,
			},
		},
	}, nil
}

func dtToErgastParts(dt time.Time) (string, string) {
	dtu := dt.UTC()
	dateS := dtu.Format("2006-01-02")
	timeS := dtu.Format("15:04:05Z")
	return dateS, timeS
}

func CircuitAssetsPayloadFromDB(db *gorm.DB, season int, lang string) (map[string]any, error) {
	type row struct {
		Round        int        `gorm:"column:round"`
		RaceName     *string    `gorm:"column:race_name"`
		RaceStartUTC *time.Time `gorm:"column:race_start_utc"`
		CircuitID    string     `gorm:"column:ergast_circuit_id"`
		CircuitName  *string    `gorm:"column:circuit_name"`
		Country      *string    `gorm:"column:country"`
		Locality     *string    `gorm:"column:locality"`
		Latitude     *string    `gorm:"column:latitude"`
		Longitude    *string    `gorm:"column:longitude"`
		ErgastURL    *string    `gorm:"column:ergast_url"`
		Formula1Slug *string    `gorm:"column:formula1_slug"`
		TrackKey     *string    `gorm:"column:track_key"`
		MapImageURL  *string    `gorm:"column:map_image_url"`
		AssetsJSON   []byte     `gorm:"column:assets_json"`
	}
	var rows []row
	if err := db.Raw(`
            SELECT
              r.round,
              r.race_name,
              COALESCE(rs.start_utc, r.race_start_utc) AS race_start_utc,
              c.ergast_circuit_id,
              c.name AS circuit_name,
              c.country,
              c.locality,
              c.latitude,
              c.longitude,
              c.ergast_url,
              c.formula1_slug,
              c.track_key,
              c.map_image_url,
              c.assets_json
            FROM f1_race r
            JOIN f1_circuit c ON c.id = r.circuit_id
            LEFT JOIN f1_race_session rs ON rs.race_id = r.id AND rs.session_type = 'RACE'
            WHERE r.season_year = ?
            ORDER BY r.round ASC
        `, season).Scan(&rows).Error; err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, errors.New("no_circuit_assets")
	}

	circuitKeys := make([]string, 0, len(rows))
	raceKeys := make([]string, 0, len(rows))
	for _, r := range rows {
		cid := strings.TrimSpace(r.CircuitID)
		if cid != "" {
			circuitKeys = append(circuitKeys, cid)
		}
		raceKeys = append(raceKeys, fmt.Sprintf("%d_%d", season, r.Round))
	}
	circuitNameMap, _ := fetchI18nText(db, lang, "circuit", "name", circuitKeys)
	circuitCountryMap, _ := fetchI18nText(db, lang, "circuit", "country", circuitKeys)
	circuitLocalityMap, _ := fetchI18nText(db, lang, "circuit", "locality", circuitKeys)
	raceNameMap, _ := fetchI18nText(db, lang, "race", "race_name", raceKeys)

	items := make([]any, 0, len(rows))
	for _, r := range rows {
		cid := strings.TrimSpace(r.CircuitID)
		if cid == "" {
			continue
		}
		if len(bytes.TrimSpace(r.AssetsJSON)) > 0 {
			var payload map[string]any
			if err := json.Unmarshal(r.AssetsJSON, &payload); err == nil && payload != nil {
				if _, ok := payload["circuit_id"]; !ok {
					payload["circuit_id"] = cid
				}
				if _, ok := payload["public_map_image_url"]; !ok {
					payload["public_map_image_url"] = payload["map_image_url"]
				}
				payload["public_map_image_url"] = normalizePublicStaticURL(payload["public_map_image_url"], season, cid, "map")
				if _, ok := payload["public_map_image_url_detail"]; !ok {
					payload["public_map_image_url_detail"] = payload["map_image_url_detail"]
				}
				payload["public_map_image_url_detail"] = normalizePublicStaticURL(payload["public_map_image_url_detail"], season, cid, "detail")
				items = append(items, payload)
				continue
			}
		}

		raceName := strPtr(r.RaceName)
		if v, ok := raceNameMap[fmt.Sprintf("%d_%d", season, r.Round)]; ok && strings.TrimSpace(v) != "" {
			raceName = strings.TrimSpace(v)
		}
		circuitName := strPtr(r.CircuitName)
		if v, ok := circuitNameMap[cid]; ok && strings.TrimSpace(v) != "" {
			circuitName = strings.TrimSpace(v)
		}
		country := strPtr(r.Country)
		if v, ok := circuitCountryMap[cid]; ok && strings.TrimSpace(v) != "" {
			country = strings.TrimSpace(v)
		}
		locality := strPtr(r.Locality)
		if v, ok := circuitLocalityMap[cid]; ok && strings.TrimSpace(v) != "" {
			locality = strings.TrimSpace(v)
		}

		dateS := ""
		timeS := ""
		if r.RaceStartUTC != nil {
			dateS, timeS = dtToErgastParts((*r.RaceStartUTC).UTC())
		}

		it := map[string]any{
			"season":                      season,
			"round":                       r.Round,
			"race_name":                   raceName,
			"date":                        dateS,
			"time":                        timeS,
			"circuit_id":                  cid,
			"circuit_name":                circuitName,
			"country":                     country,
			"locality":                    locality,
			"lat":                         strPtr(r.Latitude),
			"long":                        strPtr(r.Longitude),
			"ergast_url":                  strPtr(r.ErgastURL),
			"formula1_slug":               strPtr(r.Formula1Slug),
			"track_key":                   strPtr(r.TrackKey),
			"public_map_image_url":        normalizePublicStaticURL(strPtr(r.MapImageURL), season, cid, "map"),
			"downloaded":                  nil,
			"public_map_image_url_detail": normalizePublicStaticURL("", season, cid, "detail"),
			"downloaded_detail":           nil,
			"stats":                       map[string]any{},
		}
		items = append(items, it)
	}

	return map[string]any{
		"season":         season,
		"source":         "mysql",
		"updated_at_utc": time.Now().UTC().Format(time.RFC3339Nano),
		"items":          items,
	}, nil
}

func strPtr(p *string) any {
	if p == nil {
		return nil
	}
	s := strings.TrimSpace(*p)
	if s == "" {
		return ""
	}
	return s
}

func normalizePublicStaticURL(v any, season int, circuitID string, kind string) any {
	s := strings.TrimSpace(fmt.Sprintf("%v", v))
	if s == "" || s == "<nil>" {
		if kind == "detail" {
			return fmt.Sprintf("/static/circuits/%d/%s_detail.png", season, circuitID)
		}
		return fmt.Sprintf("/static/circuits/%d/%s.png", season, circuitID)
	}
	if strings.HasPrefix(s, "http://") || strings.HasPrefix(s, "https://") {
		return s
	}
	if strings.HasPrefix(s, "/static/") {
		return s
	}
	if strings.HasPrefix(s, "static/") {
		return "/" + s
	}
	if strings.HasPrefix(s, "/circuits/") {
		return "/static" + s
	}
	if strings.HasPrefix(s, "circuits/") {
		return "/static/" + s
	}
	return s
}
