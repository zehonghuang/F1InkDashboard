package handlers

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"toinc_f1_backend/internal/cache"
	"toinc_f1_backend/internal/config"
	"toinc_f1_backend/internal/f1db"
	"toinc_f1_backend/internal/model"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func F1SessionMeta(cfg config.Config, db *gorm.DB, cch *cache.TTLCache) gin.HandlerFunc {
	_ = cfg
	return func(c *gin.Context) {
		if db == nil {
			LogReqError(c, "f1_session_meta", "mysql_required", nil)
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "mysql_required"})
			return
		}

		sk := toIntQuery(c, "session_key", 0)
		if sk <= 0 {
			c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: "session_key_required"})
			return
		}

		lang := strings.TrimSpace(c.GetString("language"))
		season := toIntQuery(c, "season", 0)

		type spec struct {
			Code   string
			NameCN string
			NameEN string
			Field  string
		}
		specs := []spec{
			{Code: "FP1", NameCN: "练习赛一", NameEN: "Practice 1", Field: "FirstPractice"},
			{Code: "FP2", NameCN: "练习赛二", NameEN: "Practice 2", Field: "SecondPractice"},
			{Code: "FP3", NameCN: "练习赛三", NameEN: "Practice 3", Field: "ThirdPractice"},
			{Code: "SQ", NameCN: "冲刺赛排位赛", NameEN: "Sprint Qualifying", Field: "SprintQualifying"},
			{Code: "SPRINT", NameCN: "冲刺赛正赛", NameEN: "Sprint", Field: "Sprint"},
			{Code: "Q", NameCN: "排位赛", NameEN: "Qualifying", Field: "Qualifying"},
			{Code: "RACE", NameCN: "正赛", NameEN: "Race", Field: ""},
		}

		nowYear := time.Now().UTC().Year()
		seasons := []int{}
		if season > 0 {
			seasons = append(seasons, season)
		} else {
			seasons = append(seasons, nowYear+1, nowYear, nowYear-1, nowYear-2)
		}
		seen := map[int]bool{}
		cands := make([]int, 0, len(seasons))
		for _, y := range seasons {
			if y <= 0 || y > 2100 || seen[y] {
				continue
			}
			seen[y] = true
			cands = append(cands, y)
		}

		for _, y := range cands {
			key := "openf1_schedule_" + strconv.Itoa(y) + "_" + lang
			scheduleAny, err := cch.GetOrSet(key, 30*time.Second, func() (any, error) {
				return f1db.OpenF1ScheduleJSON(db, y, lang)
			})
			if err != nil {
				if season > 0 {
					LogReqError(c, "f1_session_meta", "schedule_unavailable", err)
					c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "schedule_unavailable"})
					return
				}
				continue
			}
			scheduleJSON, _ := scheduleAny.(map[string]any)
			if scheduleJSON == nil {
				continue
			}

			races := extractScheduleRaces(scheduleJSON)
			for _, race := range races {
				if race == nil {
					continue
				}
				for _, sp := range specs {
					var v int
					if sp.Code == "RACE" {
						v, _ = anyToInt(race["openf1_race_session_key"])
					} else {
						raw, ok := race[sp.Field].(map[string]any)
						if !ok || raw == nil {
							continue
						}
						v, _ = anyToInt(raw["openf1_session_key"])
					}
					if v != sk {
						continue
					}

					round, _ := anyToInt(race["round"])
					raceName := strings.TrimSpace(fmt.Sprintf("%v", race["raceName"]))
					display := strings.TrimSpace(fmt.Sprintf("%d %s %s", y, raceName, sp.NameCN))
					c.JSON(200, model.F1SessionMetaResponse{
						Ok:             true,
						GeneratedAtUTC: time.Now().UTC().Format(time.RFC3339Nano),
						SessionKey:     sk,
						Season:         y,
						Round:          round,
						RaceName:       raceName,
						SessionCode:    sp.Code,
						SessionNameCN:  sp.NameCN,
						SessionNameEN:  sp.NameEN,
						DisplayTitleCN: display,
					})
					return
				}
			}
		}

		c.JSON(http.StatusNotFound, model.ErrorResponse{Ok: false, Error: "session_not_found"})
	}
}

