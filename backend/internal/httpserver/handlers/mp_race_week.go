package handlers

import (
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	"toinc_f1_backend/internal/f1db"
	"toinc_f1_backend/internal/f1logic"
	"toinc_f1_backend/internal/model"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func MpRaceWeek(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		if db == nil {
			LogReqError(c, "mp_race_week", "mysql_required", nil)
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "mysql_required"})
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
		lang := strings.TrimSpace(c.GetString("language"))
		scheduleJSON, err := f1db.OpenF1ScheduleJSON(db, season, lang)
		if err != nil {
			LogReqError(c, "mp_race_week", "schedule_unavailable", err)
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "schedule_unavailable"})
			return
		}

		races := extractScheduleRaces(scheduleJSON)
		if races == nil {
			LogReqError(c, "mp_race_week", "schedule_unavailable", nil)
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "schedule_unavailable"})
			return
		}

		nowUTC := time.Now().UTC()
		nowLocal := nowUTC.In(loc)
		pyWd := (int(nowLocal.Weekday()) + 6) % 7
		weekStartLocal := time.Date(nowLocal.Year(), nowLocal.Month(), nowLocal.Day(), 0, 0, 0, 0, loc).AddDate(0, 0, -pyWd)
		weekEndLocal := weekStartLocal.AddDate(0, 0, 7)

		var weekRace map[string]any
		var weekRaceDtUTC time.Time
		for _, r := range races {
			dtUTC := parseScheduleStartUTC(r)
			if dtUTC.IsZero() {
				continue
			}
			dtLocal := dtUTC.In(loc)
			if dtLocal.Before(weekStartLocal) || !dtLocal.Before(weekEndLocal) {
				continue
			}
			if weekRace == nil || dtUTC.Before(weekRaceDtUTC) {
				weekRace = r
				weekRaceDtUTC = dtUTC
			}
		}

		isRaceWeek := weekRace != nil
		var outRace *model.MpRaceWeekRace
		var outNext *model.MpRaceWeekNextSession

		if isRaceWeek {
			round, _ := anyToInt(weekRace["round"])
			raceName := strings.TrimSpace(fmt.Sprintf("%v", weekRace["raceName"]))
			skRace, _ := anyToInt(weekRace["openf1_race_session_key"])
			var skRaceOut *int
			if skRace > 0 {
				x := skRace
				skRaceOut = &x
			}
			country := scheduleCountryFromRace(weekRace)
			var countryOut *string
			if country != "" && country != "<nil>" {
				x := country
				countryOut = &x
			}

			outRace = &model.MpRaceWeekRace{
				Season:               season,
				Round:                round,
				RaceName:             raceName,
				Country:              countryOut,
				RaceDateUTC:          weekRaceDtUTC.Format(time.RFC3339Nano),
				RaceDateLocal:        weekRaceDtUTC.In(loc).Format("2006-01-02 15:04"),
				OpenF1RaceSessionKey: skRaceOut,
			}

			type item struct {
				Dt  time.Time
				Key string
				SK  int
			}
			items := make([]item, 0, 8)
			keys := []string{"FP1", "FP2", "FP3", "SQ", "SPRINT", "Q", "RACE"}
			for _, k := range keys {
				dtUTC, sk, ok := scheduleSessionFromRace(weekRace, k)
				if !ok || dtUTC.IsZero() {
					continue
				}
				items = append(items, item{Dt: dtUTC, Key: k, SK: sk})
			}
			sort.SliceStable(items, func(i, j int) bool {
				return items[i].Dt.Before(items[j].Dt)
			})

			var next item
			foundNext := false
			for _, it := range items {
				if it.Dt.After(nowUTC) {
					next = it
					foundNext = true
					break
				}
			}
			if !foundNext && weekRaceDtUTC.After(nowUTC) {
				next = item{Dt: weekRaceDtUTC, Key: "RACE", SK: skRace}
				foundNext = true
			}

			if foundNext {
				var skOut *int
				if next.SK > 0 {
					x := next.SK
					skOut = &x
				}
				delta := next.Dt.Sub(nowUTC)
				outNext = &model.MpRaceWeekNextSession{
					Key:              next.Key,
					StartsAtUTC:      next.Dt.Format(time.RFC3339Nano),
					StartsAtLocal:    next.Dt.In(loc).Format("01.02 15:04"),
					In:               f1logic.FormatHMS(delta),
					Seconds:          int(delta.Seconds()),
					OpenF1SessionKey: skOut,
				}
			}
		}

		c.JSON(200, model.MpRaceWeekResponse{
			Ok:             true,
			GeneratedAtUTC: time.Now().UTC().Format(time.RFC3339Nano),
			Season:         season,
			TZ:             tzName,
			WeekStartLocal: weekStartLocal.Format("2006-01-02"),
			WeekEndLocal:   weekEndLocal.Format("2006-01-02"),
			IsRaceWeek:     isRaceWeek,
			Race:           outRace,
			NextSession:    outNext,
		})
	}
}

func scheduleCountryFromRace(race map[string]any) string {
	c, ok := race["Circuit"].(map[string]any)
	if !ok || c == nil {
		return ""
	}
	loc, ok := c["Location"].(map[string]any)
	if !ok || loc == nil {
		return ""
	}
	return strings.TrimSpace(fmt.Sprintf("%v", loc["country"]))
}
