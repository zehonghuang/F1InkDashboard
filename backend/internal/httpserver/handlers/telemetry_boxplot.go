package handlers

import (
	"math"
	"net/http"
	"sort"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type boxplotStats struct {
	DriverNumber int       `json:"driver_number"`
	NameAcronym  *string   `json:"name_acronym"`
	TeamColour   *string   `json:"team_colour"`
	SampleCount  int       `json:"sample_count"`
	Min          float64   `json:"min"`
	Q1           float64   `json:"q1"`
	Median       float64   `json:"median"`
	Q3           float64   `json:"q3"`
	Max          float64   `json:"max"`
	IQR          float64   `json:"iqr"`
	WhiskerLow   float64   `json:"whisker_low"`
	WhiskerHigh  float64   `json:"whisker_high"`
	Outliers     []float64 `json:"outliers"`
}

// @Summary 圈速箱线图
// @Tags Telemetry
// @Produce json
// @Param session_key query int true "OpenF1 session_key"
// @Param driver_numbers query string true "车手号码 CSV，例如 1,16,44"
// @Param include_pit_out query int false "1 表示包含 pit out 圈" default(0)
// @Param exclude_flags query int false "1 表示排除标记圈；0 表示不排除" default(1)
// @Success 200 {object} GenericObject
// @Failure 400 {object} ErrorResponse
// @Failure 502 {object} ErrorResponse
// @Failure 503 {object} ErrorResponse
// @Router /api/v1/telemetry/lap_time_boxplot [get]
func TelemetryLapTimeBoxplot(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		if db == nil {
			LogReqError(c, "telemetry_lap_time_boxplot", "mysql_required", nil)
			c.JSON(http.StatusServiceUnavailable, gin.H{"ok": false, "error": "mysql_required"})
			return
		}

		skS := strings.TrimSpace(c.Query("session_key"))
		sk, err := strconv.Atoi(skS)
		if err != nil || sk < 1 {
			c.JSON(400, gin.H{"ok": false, "error": "bad_session_key"})
			return
		}

		driverNums, ok := parseCSVInts(strings.TrimSpace(c.Query("driver_numbers")))
		if !ok || len(driverNums) == 0 {
			c.JSON(400, gin.H{"ok": false, "error": "bad_driver_numbers"})
			return
		}
		driverNums = uniqIntsLocal(driverNums)
		sort.Ints(driverNums)

		includePitOut := strings.TrimSpace(c.Query("include_pit_out")) == "1"
		excludeFlags := strings.TrimSpace(c.Query("exclude_flags")) != "0"

		type drvRow struct {
			DriverNumber int     `gorm:"column:driver_number"`
			NameAcronym  *string `gorm:"column:name_acronym"`
			TeamColour   *string `gorm:"column:team_colour"`
		}
		var drv []drvRow
		_ = db.Raw(`
			SELECT driver_number, name_acronym, team_colour
			FROM openf1_drivers
			WHERE session_key = ? AND driver_number IN (?)
		`, sk, driverNums).Scan(&drv).Error
		byDriver := map[int]drvRow{}
		for _, d := range drv {
			byDriver[d.DriverNumber] = d
		}

		type lapRow struct {
			DriverNumber int     `gorm:"column:driver_number"`
			LapDuration  float64 `gorm:"column:lap_duration"`
		}
		var laps []lapRow
		q := `
			SELECT l.driver_number, l.lap_duration
			FROM openf1_laps l
			WHERE l.session_key = ?
			  AND l.driver_number IN (?)
			  AND l.lap_duration IS NOT NULL
			  AND l.lap_duration > 0
		`
		args := []any{sk, driverNums}
		if !includePitOut {
			q += " AND (l.is_pit_out_lap IS NULL OR l.is_pit_out_lap = 0)"
		}
		if excludeFlags {
			q = `
				SELECT l.driver_number, l.lap_duration
				FROM openf1_laps l
				LEFT JOIN openf1_lap_tags t
				  ON t.session_key = l.session_key
				 AND t.driver_number = l.driver_number
				 AND t.lap_number = l.lap_number
				 AND t.date_start_utc = l.date_start_utc
				WHERE l.session_key = ?
				  AND l.driver_number IN (?)
				  AND l.lap_duration IS NOT NULL
				  AND l.lap_duration > 0
			`
			if !includePitOut {
				q += " AND (l.is_pit_out_lap IS NULL OR l.is_pit_out_lap = 0)"
			}
			q += `
				  AND (
				    t.id IS NULL
				    OR (
				      t.has_yellow = 0
				      AND t.has_sc = 0
				      AND t.has_vsc = 0
				      AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(t.flags_json, '$.red')), 'false') = 'false'
				    )
				  )
			`
		}
		q += " ORDER BY l.driver_number ASC, l.lap_duration ASC"

		if err := db.Raw(q, args...).Scan(&laps).Error; err != nil {
			if excludeFlags && strings.Contains(strings.ToLower(err.Error()), "openf1_lap_tags") {
				excludeFlags = false
				q2 := `
					SELECT l.driver_number, l.lap_duration
					FROM openf1_laps l
					WHERE l.session_key = ?
					  AND l.driver_number IN (?)
					  AND l.lap_duration IS NOT NULL
					  AND l.lap_duration > 0
				`
				if !includePitOut {
					q2 += " AND (l.is_pit_out_lap IS NULL OR l.is_pit_out_lap = 0)"
				}
				q2 += " ORDER BY l.driver_number ASC, l.lap_duration ASC"
				if err2 := db.Raw(q2, args...).Scan(&laps).Error; err2 != nil {
					c.JSON(502, gin.H{"ok": false, "error": "query_failed"})
					return
				}
			} else {
				c.JSON(502, gin.H{"ok": false, "error": "query_failed"})
				return
			}
		}

		valuesByDriver := map[int][]float64{}
		for _, r := range laps {
			if r.DriverNumber < 1 || !(r.LapDuration > 0) {
				continue
			}
			valuesByDriver[r.DriverNumber] = append(valuesByDriver[r.DriverNumber], r.LapDuration)
		}

		items := make([]boxplotStats, 0, len(driverNums))
		for _, dn := range driverNums {
			vals := valuesByDriver[dn]
			if len(vals) == 0 {
				continue
			}
			sort.Float64s(vals)
			minV := vals[0]
			maxV := vals[len(vals)-1]
			q1, med, q3 := quartiles(vals)
			iqr := q3 - q1
			fenceLow := q1 - 1.5*iqr
			fenceHigh := q3 + 1.5*iqr
			wl := minV
			wh := maxV
			for _, v := range vals {
				if v >= fenceLow {
					wl = v
					break
				}
			}
			for i := len(vals) - 1; i >= 0; i-- {
				v := vals[i]
				if v <= fenceHigh {
					wh = v
					break
				}
			}
			outliers := make([]float64, 0)
			for _, v := range vals {
				if v < wl || v > wh {
					outliers = append(outliers, v)
				}
			}
			d := byDriver[dn]
			items = append(items, boxplotStats{
				DriverNumber: dn,
				NameAcronym:  trimPtr(d.NameAcronym),
				TeamColour:   trimPtr(d.TeamColour),
				SampleCount:  len(vals),
				Min:          round3(minV),
				Q1:           round3(q1),
				Median:       round3(med),
				Q3:           round3(q3),
				Max:          round3(maxV),
				IQR:          round3(iqr),
				WhiskerLow:   round3(wl),
				WhiskerHigh:  round3(wh),
				Outliers:     round3Slice(outliers),
			})
		}

		c.JSON(200, gin.H{
			"ok":          true,
			"session_key": sk,
			"metric":      "lap_duration",
			"unit":        "s",
			"subset": func() string {
				if includePitOut {
					if excludeFlags {
						return "no_flags"
					}
					return "all"
				}
				if excludeFlags {
					return "no_pit_out_no_flags"
				}
				return "no_pit_out"
			}(),
			"items": items,
		})
	}
}

func parseCSVInts(s string) ([]int, bool) {
	if strings.TrimSpace(s) == "" {
		return nil, false
	}
	parts := strings.Split(s, ",")
	out := make([]int, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		n, err := strconv.Atoi(p)
		if err != nil || n < 1 {
			return nil, false
		}
		out = append(out, n)
	}
	return out, true
}

func quartiles(sorted []float64) (float64, float64, float64) {
	n := len(sorted)
	if n == 0 {
		return 0, 0, 0
	}
	med := medianSorted(sorted)
	if n == 1 {
		return sorted[0], sorted[0], sorted[0]
	}
	var lo []float64
	var hi []float64
	if n%2 == 0 {
		lo = sorted[:n/2]
		hi = sorted[n/2:]
	} else {
		lo = sorted[:n/2]
		hi = sorted[n/2+1:]
	}
	return medianSorted(lo), med, medianSorted(hi)
}

func medianSorted(sorted []float64) float64 {
	n := len(sorted)
	if n == 0 {
		return 0
	}
	m := n / 2
	if n%2 == 1 {
		return sorted[m]
	}
	return (sorted[m-1] + sorted[m]) / 2
}

func round3(v float64) float64 {
	return math.Round(v*1000) / 1000
}

func round3Slice(in []float64) []float64 {
	out := make([]float64, 0, len(in))
	for _, v := range in {
		out = append(out, round3(v))
	}
	return out
}

func trimPtr(s *string) *string {
	if s == nil {
		return nil
	}
	t := strings.TrimSpace(*s)
	if t == "" {
		return nil
	}
	return &t
}
