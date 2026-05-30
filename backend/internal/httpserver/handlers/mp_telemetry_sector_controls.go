package handlers

import (
	"encoding/json"
	"math"
	"net/http"
	"strings"
	"time"

	"toinc_f1_backend/internal/f1db"
	"toinc_f1_backend/internal/model"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// @Summary 分段油门/刹车曲线（带 sector 归属）
// @Description 返回 points[{x, sector, t_ms, speed, throttle, brake}]。
// @Tags MiniProgram
// @Produce json
// @Param session_key query int true "OpenF1 session_key"
// @Param driver_number query int true "车手号码"
// @Param max_points query int false "最大采样点（0 表示默认策略，最大 20000）" default(0)
// @Param lap query string false "选择圈：fastest/all 等" default(fastest)
// @Param lap_number query int false "指定圈号"
// @Success 200 {object} model.MpTelemetrySectorControlsResponse
// @Failure 400 {object} model.ErrorResponse
// @Failure 503 {object} model.ErrorResponse
// @Router /api/v1/mp/telemetry/sector_controls [get]
func MpTelemetrySectorControls(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		if db == nil {
			LogReqError(c, "mp_telemetry_sector_controls", "mysql_required", nil)
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "mysql_required"})
			return
		}
		sessionKey := toIntQuery(c, "session_key", 0)
		driverNumber := toIntQuery(c, "driver_number", 0)
		if sessionKey <= 0 || driverNumber <= 0 {
			c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: "session_key_and_driver_number_required"})
			return
		}

		maxPoints := toIntQuery(c, "max_points", 0)
		if maxPoints < 0 {
			maxPoints = 0
		}
		if maxPoints > 20000 {
			maxPoints = 20000
		}

		lapMode := strings.TrimSpace(strings.ToLower(c.Query("lap")))
		if lapMode == "" {
			lapMode = "fastest"
		}
		lapNumber := toIntQuery(c, "lap_number", 0)

		chosenLapNumber := 0
		lapDurationSec := 0.0
		if lapMode != "all" {
			type lapRow struct {
				LapNumber   int       `gorm:"column:lap_number"`
				LapDuration float64   `gorm:"column:lap_duration"`
				DateStart   time.Time `gorm:"column:date_start_utc"`
			}
			var lr lapRow
			q := `
				SELECT lap_number, lap_duration, date_start_utc
				FROM openf1_laps
				WHERE session_key = ?
				  AND driver_number = ?
				  AND lap_duration IS NOT NULL
				  AND lap_duration > 0
			`
			args := []any{sessionKey, driverNumber}
			if lapNumber > 0 {
				q += " AND lap_number = ?"
				args = append(args, lapNumber)
			}
			q += " ORDER BY lap_duration ASC LIMIT 1"
			_ = db.Raw(q, args...).Scan(&lr).Error
			if lr.LapNumber > 0 && lr.LapDuration > 0 {
				chosenLapNumber = lr.LapNumber
				lapDurationSec = lr.LapDuration
			}
		}

		if chosenLapNumber <= 0 {
			nil3 := []*float64{nil, nil, nil}
			c.JSON(200, model.MpTelemetrySectorControlsResponse{
				Ok:             true,
				GeneratedAtUTC: time.Now().UTC().Format(time.RFC3339Nano),
				SessionKey:     sessionKey,
				DriverNumber:   driverNumber,
				LapMode:        lapMode,
				LapNumber:      nil,
				LapTime:        nil,
				X:              []string{"S1", "S2", "S3"},
				Throttle:       nil3,
				Brake:          nil3,
				Speed:          nil3,
			})
			return
		}

		sk := sessionKey
		series, err := f1db.TelemetryLapControlsSeries(db, driverNumber, &sk, chosenLapNumber, maxPoints)
		if err != nil {
			c.JSON(502, model.ErrorResponse{Ok: false, Error: "query_failed"})
			return
		}

		type payload struct {
			V       int             `json:"v"`
			S1EndMs *int            `json:"s1_end_ms"`
			S2EndMs *int            `json:"s2_end_ms"`
			S1EndI  *int            `json:"s1_end_i"`
			S2EndI  *int            `json:"s2_end_i"`
			Points  [][]interface{} `json:"points"`
		}

		var p payload
		if len(series.Payload) > 0 && string(series.Payload) != "null" {
			_ = json.Unmarshal(series.Payload, &p)
		}

		points := p.Points
		if len(points) == 0 {
			nil3 := []*float64{nil, nil, nil}
			lapNumberOut := chosenLapNumber
			var lapTimeOut *string
			if lapDurationSec > 0 {
				s := formatLapDurationSimple(lapDurationSec)
				if s != "" {
					lapTimeOut = &s
				}
			}
			c.JSON(200, model.MpTelemetrySectorControlsResponse{
				Ok:             true,
				GeneratedAtUTC: time.Now().UTC().Format(time.RFC3339Nano),
				SessionKey:     sessionKey,
				DriverNumber:   driverNumber,
				LapMode:        lapMode,
				LapNumber:      &lapNumberOut,
				LapTime:        lapTimeOut,
				X:              []string{"S1", "S2", "S3"},
				Throttle:       nil3,
				Brake:          nil3,
				Speed:          nil3,
			})
			return
		}

		findEndIndexByMs := func(endMs *int) *int {
			if endMs == nil || *endMs <= 0 {
				return nil
			}
			ms := float64(*endMs)
			for i, pt := range points {
				if len(pt) < 1 {
					continue
				}
				t0, ok := pt[0].(float64)
				if !ok {
					continue
				}
				if t0 >= ms {
					x := i
					return &x
				}
			}
			if len(points) > 0 {
				x := len(points) - 1
				return &x
			}
			x := 0
			return &x
		}

		s1i := p.S1EndI
		if s1i == nil {
			s1i = findEndIndexByMs(p.S1EndMs)
		}
		s2i := p.S2EndI
		if s2i == nil {
			s2i = findEndIndexByMs(p.S2EndMs)
		}

		if s1i == nil || s2i == nil {
			n := len(points)
			if n < 3 {
				z0 := 0
				z1 := int(math.Max(0, float64(n-1)))
				s1i = &z0
				s2i = &z1
			} else {
				a := n / 3
				b := (2 * n) / 3
				if a < 0 {
					a = 0
				}
				if b < a {
					b = a
				}
				if a > n-1 {
					a = n - 1
				}
				if b > n-1 {
					b = n - 1
				}
				s1i = &a
				s2i = &b
			}
		}

		i1 := *s1i
		i2 := *s2i
		if i1 < 0 {
			i1 = 0
		}
		if i1 > len(points)-1 {
			i1 = len(points) - 1
		}
		if i2 < i1 {
			i2 = i1
		}
		if i2 > len(points)-1 {
			i2 = len(points) - 1
		}

		getTms := func(pt []interface{}) (float64, bool) {
			if len(pt) < 1 || pt[0] == nil {
				return 0, false
			}
			t, ok := pt[0].(float64)
			if !ok || math.IsNaN(t) {
				return 0, false
			}
			return t, true
		}

		end1, ok1 := getTms(points[i1])
		end2, ok2 := getTms(points[i2])
		end3, ok3 := getTms(points[len(points)-1])
		if !ok1 {
			end1 = 0
		}
		if !ok2 {
			end2 = end1
		}
		if !ok3 {
			end3 = end2
		}

		segStart := []float64{0, end1, end2}
		segEnd := []float64{end1, end2, end3}
		for i := 0; i < 3; i++ {
			if segEnd[i] <= segStart[i] {
				segEnd[i] = segStart[i] + 1
			}
		}

		numOrNil := func(v any) *float64 {
			if v == nil {
				return nil
			}
			f, ok := v.(float64)
			if !ok || math.IsNaN(f) {
				return nil
			}
			x := f
			return &x
		}

		outPoints := make([]model.MpTelemetrySectorControlsPoint, 0, len(points))
		for idx, pt := range points {
			tms, ok := getTms(pt)
			if !ok {
				continue
			}
			sector := 3
			if idx <= i1 {
				sector = 1
			} else if idx <= i2 {
				sector = 2
			}

			si := sector - 1
			progress := (tms - segStart[si]) / (segEnd[si] - segStart[si])
			if progress < 0 {
				progress = 0
			}
			if progress > 1 {
				progress = 1
			}
			x := float64(si) + progress
			x = math.Round(x*10000) / 10000

			var speed *float64 = nil
			var throttle *float64 = nil
			var brake *float64 = nil
			if len(pt) > 1 {
				speed = numOrNil(pt[1])
			}
			if len(pt) > 2 {
				throttle = numOrNil(pt[2])
			}
			if len(pt) > 3 {
				brake = numOrNil(pt[3])
			}

			outPoints = append(outPoints, model.MpTelemetrySectorControlsPoint{
				X:        x,
				Sector:   sector,
				TMs:      int(math.Round(tms)),
				Speed:    speed,
				Throttle: throttle,
				Brake:    brake,
			})
		}

		lapNumberOut := chosenLapNumber
		var lapTimeOut *string
		if lapDurationSec > 0 {
			s := formatLapDurationSimple(lapDurationSec)
			if s != "" {
				lapTimeOut = &s
			}
		}
		xMin := 0
		xMax := 3
		s1Out := i1
		s2Out := i2
		pc := len(outPoints)
		c.JSON(200, model.MpTelemetrySectorControlsResponse{
			Ok:             true,
			GeneratedAtUTC: time.Now().UTC().Format(time.RFC3339Nano),
			SessionKey:     sessionKey,
			DriverNumber:   driverNumber,
			LapMode:        lapMode,
			LapNumber:      &lapNumberOut,
			LapTime:        lapTimeOut,
			XLabels:        []string{"S1", "S2", "S3"},
			XMin:           &xMin,
			XMax:           &xMax,
			S1EndI:         &s1Out,
			S2EndI:         &s2Out,
			PointsCount:    &pc,
			Points:         outPoints,
		})
	}
}
