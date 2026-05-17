package handlers

import (
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	"toinc_f1_backend/internal/f1db"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func MpRaceSessions(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		if db == nil {
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

		season := toIntQuery(c, "season", 2026)
		round := toIntQuery(c, "round", 0)
		if round <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "round_required"})
			return
		}

		scheduleJSON, err := f1db.OpenF1ScheduleJSON(db, season)
		if err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"ok": false, "error": "schedule_unavailable"})
			return
		}
		races := extractScheduleRaces(scheduleJSON)
		var race map[string]any
		for _, r := range races {
			rr, ok := anyToInt(r["round"])
			if !ok || rr != round {
				continue
			}
			race = r
			break
		}
		if race == nil {
			c.JSON(http.StatusNotFound, gin.H{"ok": false, "error": "race_not_found"})
			return
		}

		nowUTC := time.Now().UTC()

		type spec struct {
			Key      string
			NameCN   string
			NameEN   string
			Duration time.Duration
		}
		specs := []spec{
			{Key: "FP1", NameCN: "练习赛一", NameEN: "Practice 1", Duration: 60 * time.Minute},
			{Key: "FP2", NameCN: "练习赛二", NameEN: "Practice 2", Duration: 60 * time.Minute},
			{Key: "FP3", NameCN: "练习赛三", NameEN: "Practice 3", Duration: 60 * time.Minute},
			{Key: "SQ", NameCN: "冲刺赛排位赛", NameEN: "Sprint Qualifying", Duration: 45 * time.Minute},
			{Key: "SPRINT", NameCN: "冲刺赛正赛", NameEN: "Sprint", Duration: 60 * time.Minute},
			{Key: "Q", NameCN: "排位赛", NameEN: "Qualifying", Duration: 60 * time.Minute},
			{Key: "RACE", NameCN: "正赛", NameEN: "Race", Duration: 120 * time.Minute},
		}

		type tmpItem struct {
			Dt   time.Time
			Done bool
			Obj  any
		}
		tmp := make([]tmpItem, 0, len(specs))
		for _, sp := range specs {
			dtUTC, sk, ok := scheduleSessionFromRace(race, sp.Key)
			if !ok || dtUTC.IsZero() {
				continue
			}
			endUTC := dtUTC.Add(sp.Duration)
			status := "upcoming"
			if nowUTC.After(endUTC) {
				status = "done"
			} else if nowUTC.After(dtUTC) {
				status = "live"
			}
			disabled := status != "done"

			tmp = append(tmp, tmpItem{Dt: dtUTC, Done: status == "done", Obj: gin.H{
				"key":         sp.Key,
				"name_cn":     sp.NameCN,
				"name_en":     sp.NameEN,
				"start_utc":   dtUTC.Format(time.RFC3339Nano),
				"start_local": dtUTC.In(loc).Format("01.02 15:04"),
				"status":      status,
				"disabled":    disabled,
				"openf1_session_key": func() any {
					if sk <= 0 {
						return nil
					}
					return sk
				}(),
			}})
		}

		upcoming := make([]tmpItem, 0, len(tmp))
		doneItems := make([]tmpItem, 0, len(tmp))
		for _, it := range tmp {
			if it.Done {
				doneItems = append(doneItems, it)
				continue
			}
			upcoming = append(upcoming, it)
		}
		sort.SliceStable(upcoming, func(i, j int) bool {
			return upcoming[i].Dt.Before(upcoming[j].Dt)
		})
		sort.SliceStable(doneItems, func(i, j int) bool {
			return doneItems[i].Dt.After(doneItems[j].Dt)
		})
		out := make([]any, 0, len(tmp))
		for _, it := range upcoming {
			out = append(out, it.Obj)
		}
		for _, it := range doneItems {
			out = append(out, it.Obj)
		}

		c.JSON(200, gin.H{
			"ok":               true,
			"generated_at_utc": time.Now().UTC().Format(time.RFC3339Nano),
			"season":           season,
			"round":            round,
			"race_name":        strings.TrimSpace(fmt.Sprintf("%v", race["raceName"])),
			"tz":               tzName,
			"sessions":         out,
		})
	}
}

func scheduleSessionFromRace(race map[string]any, key string) (time.Time, int, bool) {
	switch strings.ToUpper(strings.TrimSpace(key)) {
	case "RACE":
		sk, _ := anyToInt(race["openf1_race_session_key"])
		dt := parseScheduleStartUTC(race)
		if dt.IsZero() {
			return time.Time{}, 0, false
		}
		return dt.UTC(), sk, true
	case "FP1":
		return parseScheduleSubSession(race, "FirstPractice")
	case "FP2":
		return parseScheduleSubSession(race, "SecondPractice")
	case "FP3":
		return parseScheduleSubSession(race, "ThirdPractice")
	case "Q":
		return parseScheduleSubSession(race, "Qualifying")
	case "SQ":
		return parseScheduleSubSession(race, "SprintQualifying")
	case "SPRINT":
		return parseScheduleSubSession(race, "Sprint")
	default:
		return time.Time{}, 0, false
	}
}

func parseScheduleSubSession(race map[string]any, field string) (time.Time, int, bool) {
	raw, ok := race[field].(map[string]any)
	if !ok || raw == nil {
		return time.Time{}, 0, false
	}
	dt := parseScheduleStartUTC(raw)
	sk, _ := anyToInt(raw["openf1_session_key"])
	if dt.IsZero() {
		return time.Time{}, 0, false
	}
	return dt.UTC(), sk, true
}
