package handlers

import (
	"fmt"
	"math"
	"net/http"
	"sort"
	"strings"
	"time"

	"toinc_f1_backend/internal/teamdrivercache"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// @Summary Session 成绩
// @Description 返回该 session 排名 + 最快圈等（会拼装车手/车队信息）。
// @Tags MiniProgram
// @Produce json
// @Param session_key query int true "OpenF1 session_key"
// @Success 200 {object} GenericObject
// @Failure 400 {object} ErrorResponse
// @Failure 503 {object} ErrorResponse
// @Router /api/v1/mp/session-results [get]
func MpSessionResults(db *gorm.DB, tdCache *teamdrivercache.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		if db == nil {
			LogReqError(c, "mp_session_results", "mysql_required", nil)
			c.JSON(http.StatusServiceUnavailable, gin.H{"ok": false, "error": "mysql_required"})
			return
		}

		sessionKey := toIntQuery(c, "session_key", 0)
		if sessionKey <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "session_key_required"})
			return
		}

		type resRow struct {
			DriverNumber int `gorm:"column:driver_number"`
			Position     int `gorm:"column:position"`
		}
		var rows []resRow
		if err := db.Raw(`
			SELECT driver_number, position
			FROM openf1_session_result
			WHERE session_key = ?
		`, sessionKey).Scan(&rows).Error; err != nil {
			LogReqError(c, "mp_session_results", "results_unavailable", err)
			c.JSON(http.StatusServiceUnavailable, gin.H{"ok": false, "error": "results_unavailable"})
			return
		}
		if len(rows) == 0 {
			c.JSON(200, gin.H{"ok": true, "session_key": sessionKey, "items": []any{}})
			return
		}

		driverNums := make([]int, 0, len(rows))
		for _, r := range rows {
			if r.DriverNumber <= 0 {
				continue
			}
			driverNums = append(driverNums, r.DriverNumber)
		}
		driverNums = uniqIntsLocal(driverNums)

		type lapRow struct {
			DriverNumber int     `gorm:"column:driver_number"`
			LapDuration  float64 `gorm:"column:lap_duration"`
		}
		var laps []lapRow
		_ = db.Raw(`
			SELECT l.driver_number, MIN(l.lap_duration) AS lap_duration
			FROM openf1_laps l
			WHERE l.session_key = ?
			  AND l.driver_number IN (?)
			  AND l.lap_duration IS NOT NULL
			  AND l.lap_duration > 0
			GROUP BY l.driver_number
		`, sessionKey, driverNums).Scan(&laps).Error
		bestLapByDriver := map[int]float64{}
		for _, it := range laps {
			if it.DriverNumber <= 0 || !(it.LapDuration > 0) {
				continue
			}
			bestLapByDriver[it.DriverNumber] = it.LapDuration
		}

		sort.SliceStable(rows, func(i, j int) bool {
			pi := rows[i].Position
			pj := rows[j].Position
			if pi <= 0 && pj <= 0 {
				return rows[i].DriverNumber < rows[j].DriverNumber
			}
			if pi <= 0 {
				return false
			}
			if pj <= 0 {
				return true
			}
			return pi < pj
		})

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

		items := make([]any, 0, len(rows))
		for _, r := range rows {
			team := ""
			avatar := ""
			teamColor := ""
			driverName := ""
			fullName := ""
			acr := ""
			teamLogoURL := ""

			if tdCache != nil {
				if di, ok := tdCache.GetDriver(r.DriverNumber); ok {
					team = strings.TrimSpace(di.TeamName)
					avatar = strings.TrimSpace(di.HeadshotURL)
					teamColor = strings.TrimSpace(di.TeamColor)
					fullName = strings.TrimSpace(di.FullName)
					acr = strings.TrimSpace(di.NameAcronym)
					driverName = fullName
					if driverName == "" {
						driverName = strings.TrimSpace(di.BroadcastName)
					}
					if driverName == "" {
						driverName = acr
					}
				}
				if team != "" {
					if ti, ok := tdCache.GetTeam(team); ok {
						if teamColor == "" {
							teamColor = strings.TrimSpace(ti.TeamColor)
						}
						teamLogoURL = strings.TrimSpace(ti.TeamLogoURL)
					}
				}
			}
			teamLogoURL = absURL(teamLogoURL)

			if driverName == "" {
				driverName = acr
			}
			if driverName == "" {
				driverName = fmt.Sprintf("%d", r.DriverNumber)
			}
			sec := bestLapByDriver[r.DriverNumber]

			items = append(items, gin.H{
				"driver_number": r.DriverNumber,
				"driver_name":   emptyToNil(driverName),
				"full_name":     emptyToNil(fullName),
				"position":      r.Position,
				"team_name":     emptyToNil(team),
				"team_color":    emptyToNil(teamColor),
				"team_logo_url": emptyToNil(teamLogoURL),
				"headshot_url":  emptyToNil(avatar),
				"name_acronym":  emptyToNil(acr),
				"lap_time":      emptyToNil(formatLapDurationSimple(sec)),
				"lap_seconds": func() any {
					if !(sec > 0) {
						return nil
					}
					return math.Round(sec*1000) / 1000
				}(),
			})
		}

		c.JSON(200, gin.H{
			"ok":               true,
			"generated_at_utc": time.Now().UTC().Format(time.RFC3339Nano),
			"session_key":      sessionKey,
			"items":            items,
		})
	}
}

func formatLapDurationSimple(seconds float64) string {
	if !(seconds > 0) {
		return ""
	}
	msTotal := int64(math.Round(seconds * 1000))
	minutes := msTotal / 60000
	sec := (msTotal % 60000) / 1000
	ms := msTotal % 1000
	return fmt.Sprintf("%d:%02d.%03d", minutes, sec, ms)
}

func normalizeTeamColor(s string) string {
	v := strings.TrimSpace(s)
	if v == "" {
		return ""
	}
	if strings.HasPrefix(v, "#") {
		v = strings.TrimPrefix(v, "#")
	}
	v = strings.TrimSpace(v)
	if len(v) == 3 {
		v = fmt.Sprintf("%c%c%c%c%c%c", v[0], v[0], v[1], v[1], v[2], v[2])
	}
	if len(v) != 6 {
		return ""
	}
	for i := 0; i < 6; i++ {
		c := v[i]
		isNum := c >= '0' && c <= '9'
		isAF := c >= 'a' && c <= 'f'
		isAFU := c >= 'A' && c <= 'F'
		if !isNum && !isAF && !isAFU {
			return ""
		}
	}
	return "#" + strings.ToUpper(v)
}
