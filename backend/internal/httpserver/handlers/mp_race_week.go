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
		windowStartLocal := nowUTC.In(loc)
		windowEndUTC := nowUTC.Add(7 * 24 * time.Hour)
		windowEndLocal := windowEndUTC.In(loc)

		var weekRace map[string]any
		var weekRaceFirstUTC time.Time
		var weekRaceItems []sessionItem
		var hasLiveRace bool
		for _, r := range races {
			items := buildRaceWeekSessionItems(r)
			if len(items) == 0 {
				continue
			}
			firstUTC := items[0].Dt
			lastEndUTC := items[len(items)-1].End
			isLive := !nowUTC.Before(firstUTC) && nowUTC.Before(lastEndUTC)
			isUpcomingSoon := firstUTC.After(nowUTC) && !firstUTC.After(windowEndUTC)
			if !isLive && !isUpcomingSoon {
				continue
			}
			if weekRace == nil ||
				(isLive && !hasLiveRace) ||
				(isLive == hasLiveRace && firstUTC.Before(weekRaceFirstUTC)) {
				weekRace = r
				weekRaceFirstUTC = firstUTC
				weekRaceItems = items
				hasLiveRace = isLive
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
			cc := scheduleCountryCodeFromRace(weekRace)
			var flagOut *string
			if cc != "" && cc != "<nil>" {
				if u, ok := f1logic.FlagURLFromCountryCode(cc); ok {
					x := u
					flagOut = &x
				}
			}

			outRace = &model.MpRaceWeekRace{
				Season:               season,
				Round:                round,
				RaceName:             raceName,
				Country:              countryOut,
				FlagURL:              flagOut,
				RaceDateUTC:          weekRaceFirstUTC.Format(time.RFC3339Nano),
				RaceDateLocal:        weekRaceFirstUTC.In(loc).Format("2006-01-02 15:04"),
				OpenF1RaceSessionKey: skRaceOut,
			}

			var next sessionItem
			foundNext := false
			for _, it := range weekRaceItems {
				if it.Dt.After(nowUTC) {
					next = it
					foundNext = true
					break
				}
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
			WeekStartLocal: windowStartLocal.Format("2006-01-02"),
			WeekEndLocal:   windowEndLocal.Format("2006-01-02"),
			IsRaceWeek:     isRaceWeek,
			Race:           outRace,
			NextSession:    outNext,
		})
	}
}

type sessionItem struct {
	Dt  time.Time
	End time.Time
	Key string
	SK  int
}

func buildRaceWeekSessionItems(race map[string]any) []sessionItem {
	keys := []string{"FP1", "FP2", "FP3", "SQ", "SPRINT", "Q", "RACE"}
	items := make([]sessionItem, 0, len(keys))
	for _, k := range keys {
		dtUTC, sk, ok := scheduleSessionFromRace(race, k)
		if !ok || dtUTC.IsZero() {
			continue
		}
		items = append(items, sessionItem{
			Dt:  dtUTC.UTC(),
			End: dtUTC.UTC().Add(raceWeekSessionDuration(k)),
			Key: k,
			SK:  sk,
		})
	}
	sort.SliceStable(items, func(i, j int) bool {
		return items[i].Dt.Before(items[j].Dt)
	})
	return items
}

func raceWeekSessionDuration(key string) time.Duration {
	if strings.EqualFold(strings.TrimSpace(key), "RACE") {
		return 4 * time.Hour
	}
	return 90 * time.Minute
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

func scheduleCountryCodeFromRace(race map[string]any) string {
	c, ok := race["Circuit"].(map[string]any)
	if !ok || c == nil {
		return ""
	}
	loc, ok := c["Location"].(map[string]any)
	if !ok || loc == nil {
		return ""
	}
	return strings.TrimSpace(fmt.Sprintf("%v", loc["country_code"]))
}
