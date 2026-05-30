package handlers

import (
	"math"
	"net/http"
	"strings"
	"time"

	"toinc_f1_backend/internal/model"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// @Summary 油门/刹车控制曲线
// @Description 返回 points[{t, throttle, brake}]。
// @Tags MiniProgram
// @Produce json
// @Param session_key query int true "OpenF1 session_key"
// @Param driver_number query int true "车手号码"
// @Param n query int false "采样点数（最大 900）" default(320)
// @Param lap query string false "选择圈：fastest/all 等" default(fastest)
// @Param lap_number query int false "指定圈号"
// @Success 200 {object} model.MpTelemetryControlsResponse
// @Failure 400 {object} model.ErrorResponse
// @Failure 503 {object} model.ErrorResponse
// @Router /api/v1/mp/telemetry/controls [get]
func MpTelemetryControls(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		if db == nil {
			LogReqError(c, "mp_telemetry_controls", "mysql_required", nil)
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "mysql_required"})
			return
		}
		sessionKey := toIntQuery(c, "session_key", 0)
		driverNumber := toIntQuery(c, "driver_number", 0)
		if sessionKey <= 0 || driverNumber <= 0 {
			c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: "session_key_and_driver_number_required"})
			return
		}
		n := toIntQuery(c, "n", 320)
		if n <= 0 {
			n = 320
		}
		if n > 900 {
			n = 900
		}

		lapMode := strings.TrimSpace(strings.ToLower(c.Query("lap")))
		if lapMode == "" {
			lapMode = "fastest"
		}
		lapNumber := toIntQuery(c, "lap_number", 0)

		lapStartUTC := time.Time{}
		lapEndUTC := time.Time{}
		lapDurationSec := 0.0
		chosenLapNumber := 0
		if lapMode != "all" {
			type lapRow struct {
				LapNumber    int       `gorm:"column:lap_number"`
				DateStartUTC time.Time `gorm:"column:date_start_utc"`
				LapDuration  float64   `gorm:"column:lap_duration"`
			}
			var lr lapRow
			q := `
				SELECT lap_number, date_start_utc, lap_duration
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
			if err := db.Raw(q, args...).Scan(&lr).Error; err == nil && lr.LapNumber > 0 && !lr.DateStartUTC.IsZero() && lr.LapDuration > 0 {
				chosenLapNumber = lr.LapNumber
				lapDurationSec = lr.LapDuration
				lapStartUTC = lr.DateStartUTC.UTC()
				lapEndUTC = lapStartUTC.Add(time.Duration(lr.LapDuration*1000) * time.Millisecond)
			}
		}

		type row struct {
			DateUTC    time.Time `gorm:"column:date_utc"`
			Throttle   int       `gorm:"column:throttle"`
			Brake      int       `gorm:"column:brake"`
			Speed      int       `gorm:"column:speed"`
			NGear      int       `gorm:"column:n_gear"`
			DRS        int       `gorm:"column:drs"`
			RPM        int       `gorm:"column:rpm"`
			SessionKey int       `gorm:"column:session_key"`
		}
		var rows []row
		query := `
			SELECT date_utc, throttle, brake, speed, n_gear, drs, rpm, session_key
			FROM openf1_car_data
			WHERE session_key = ? AND driver_number = ?
		`
		args := []any{sessionKey, driverNumber}
		if !lapStartUTC.IsZero() && !lapEndUTC.IsZero() {
			query += " AND date_utc >= ? AND date_utc <= ?"
			args = append(args, lapStartUTC, lapEndUTC)
		}
		query += " ORDER BY date_utc ASC LIMIT 6000"
		if err := db.Raw(query, args...).Scan(&rows).Error; err != nil {
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "telemetry_unavailable"})
			return
		}
		if len(rows) == 0 {
			c.JSON(200, model.MpTelemetryControlsResponse{
				Ok:           true,
				SessionKey:   sessionKey,
				DriverNumber: driverNumber,
				LapMode:      lapMode,
				LapNumber:    nil,
				LapTime:      nil,
				LapStartUTC:  nil,
				LapEndUTC:    nil,
				Points:       []model.MpTelemetryControlsPoint{},
			})
			return
		}

		start := rows[0].DateUTC.UTC()
		step := int(math.Ceil(float64(len(rows)) / float64(n)))
		if step < 1 {
			step = 1
		}

		points := make([]model.MpTelemetryControlsPoint, 0, (len(rows)+step-1)/step)
		for i := 0; i < len(rows); i += step {
			r := rows[i]
			dt := r.DateUTC.UTC()
			sec := dt.Sub(start).Seconds()
			th := clamp01to100(r.Throttle)
			br := clamp01to100(r.Brake)
			if br == 1 && th > 1 {
				br = 100
			} else if br == 1 && th <= 1 {
				br = 100
			}
			points = append(points, model.MpTelemetryControlsPoint{
				T:        math.Round(sec*1000) / 1000,
				Throttle: th,
				Brake:    br,
			})
		}

		var lapNumberOut *int
		if chosenLapNumber > 0 {
			v := chosenLapNumber
			lapNumberOut = &v
		}
		var lapTimeOut *string
		if lapDurationSec > 0 {
			s := formatLapDurationSimple(lapDurationSec)
			if s != "" {
				lapTimeOut = &s
			}
		}
		var lapStartOut *string
		if !lapStartUTC.IsZero() {
			s := lapStartUTC.Format(time.RFC3339Nano)
			lapStartOut = &s
		}
		var lapEndOut *string
		if !lapEndUTC.IsZero() {
			s := lapEndUTC.Format(time.RFC3339Nano)
			lapEndOut = &s
		}
		c.JSON(200, model.MpTelemetryControlsResponse{
			Ok:             true,
			GeneratedAtUTC: time.Now().UTC().Format(time.RFC3339Nano),
			SessionKey:     sessionKey,
			DriverNumber:   driverNumber,
			LapMode:        lapMode,
			LapNumber:      lapNumberOut,
			LapTime:        lapTimeOut,
			LapStartUTC:    lapStartOut,
			LapEndUTC:      lapEndOut,
			Points:         points,
		})
	}
}

func clamp01to100(v int) int {
	if v < 0 {
		return 0
	}
	if v > 100 {
		return 100
	}
	return v
}
