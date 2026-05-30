package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"toinc_f1_backend/internal/f1db"
	"toinc_f1_backend/internal/model"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// @Summary 可用圈列表
// @Description 需要 MySQL（TOINC_F1_MYSQL_ENABLED=1）。
// @Tags Telemetry
// @Produce json
// @Success 200 {object} model.GenericObject
// @Failure 502 {object} model.ErrorResponse
// @Failure 503 {object} model.ErrorResponse
// @Router /api/v1/telemetry/laps/available [get]
func TelemetryLapsAvailable(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		if db == nil {
			LogReqError(c, "telemetry_laps_available", "mysql_required", nil)
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "mysql_required"})
			return
		}
		items, err := f1db.TelemetryLapsAvailable(db)
		if err != nil {
			c.JSON(502, model.ErrorResponse{Ok: false, Error: "query_failed"})
			return
		}
		c.JSON(200, model.GenericObject{"ok": true, "items": items})
	}
}

// @Summary 查询圈数据
// @Tags Telemetry
// @Produce json
// @Param driver_number query int true "车手号码"
// @Param session_key query int false "OpenF1 session_key"
// @Success 200 {object} model.GenericObject
// @Failure 400 {object} model.ErrorResponse
// @Failure 502 {object} model.ErrorResponse
// @Failure 503 {object} model.ErrorResponse
// @Router /api/v1/telemetry/laps [get]
func TelemetryLaps(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		if db == nil {
			LogReqError(c, "telemetry_laps", "mysql_required", nil)
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "mysql_required"})
			return
		}
		dn, err := strconv.Atoi(strings.TrimSpace(c.Query("driver_number")))
		if err != nil || dn < 1 {
			c.JSON(400, model.ErrorResponse{Ok: false, Error: "bad_driver_number"})
			return
		}
		var sk *int
		if s := strings.TrimSpace(c.Query("session_key")); s != "" {
			if n, err := strconv.Atoi(s); err == nil {
				sk = &n
			}
		}
		sk2, laps, err := f1db.TelemetryLaps(db, dn, sk)
		if err != nil {
			c.JSON(502, model.ErrorResponse{Ok: false, Error: "query_failed"})
			return
		}
		c.JSON(200, model.GenericObject{"ok": true, "driver_number": dn, "session_key": sk2, "laps": laps})
	}
}

// @Summary 圈控制数据（简版）
// @Tags Telemetry
// @Produce json
// @Param driver_number query int true "车手号码"
// @Param session_key query int false "OpenF1 session_key"
// @Success 200 {object} model.GenericObject
// @Failure 400 {object} model.ErrorResponse
// @Failure 502 {object} model.ErrorResponse
// @Failure 503 {object} model.ErrorResponse
// @Router /api/v1/telemetry/lap_controls [get]
func TelemetryLapControls(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		if db == nil {
			LogReqError(c, "telemetry_lap_controls", "mysql_required", nil)
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "mysql_required"})
			return
		}
		dn, err := strconv.Atoi(strings.TrimSpace(c.Query("driver_number")))
		if err != nil || dn < 1 {
			c.JSON(400, model.ErrorResponse{Ok: false, Error: "bad_driver_number"})
			return
		}
		var sk *int
		if s := strings.TrimSpace(c.Query("session_key")); s != "" {
			if n, err := strconv.Atoi(s); err == nil {
				sk = &n
			}
		}
		sk2, items, err := f1db.TelemetryLapControls(db, dn, sk)
		if err != nil {
			c.JSON(502, model.ErrorResponse{Ok: false, Error: "query_failed"})
			return
		}
		c.JSON(200, model.GenericObject{"ok": true, "driver_number": dn, "session_key": sk2, "items": items})
	}
}

// @Summary 指定圈的轨迹
// @Tags Telemetry
// @Produce json
// @Param driver_number query int true "车手号码"
// @Param lap_number query int true "圈号"
// @Param session_key query int false "OpenF1 session_key"
// @Param max_points query int false "最大采样点数（50-5000）" default(600)
// @Success 200 {object} model.GenericObject
// @Failure 400 {object} model.ErrorResponse
// @Failure 502 {object} model.ErrorResponse
// @Failure 503 {object} model.ErrorResponse
// @Router /api/v1/telemetry/lap_trace [get]
func TelemetryLapTrace(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		if db == nil {
			LogReqError(c, "telemetry_lap_trace", "mysql_required", nil)
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "mysql_required"})
			return
		}
		dn, err := strconv.Atoi(strings.TrimSpace(c.Query("driver_number")))
		if err != nil || dn < 1 {
			c.JSON(400, model.ErrorResponse{Ok: false, Error: "bad_driver_number"})
			return
		}
		ln, err := strconv.Atoi(strings.TrimSpace(c.Query("lap_number")))
		if err != nil || ln < 1 {
			c.JSON(400, model.ErrorResponse{Ok: false, Error: "bad_lap_number"})
			return
		}
		var sk *int
		if s := strings.TrimSpace(c.Query("session_key")); s != "" {
			if n, err := strconv.Atoi(s); err == nil {
				sk = &n
			}
		}
		maxPoints := toIntQuery(c, "max_points", 600)
		if maxPoints < 50 {
			maxPoints = 50
		}
		if maxPoints > 5000 {
			maxPoints = 5000
		}
		sk2, start, dur, points, err := f1db.TelemetryLapTrace(db, dn, sk, ln, maxPoints)
		if err != nil {
			c.JSON(502, model.ErrorResponse{Ok: false, Error: "query_failed"})
			return
		}
		var startISO any = nil
		if start != nil {
			startISO = start.UTC()
		}
		c.JSON(200, model.GenericObject{
			"ok":             true,
			"driver_number":  dn,
			"session_key":    sk2,
			"lap_number":     ln,
			"date_start_utc": startISO,
			"duration_s":     dur,
			"points":         points,
		})
	}
}

// @Summary 最快圈轨迹
// @Tags Telemetry
// @Produce json
// @Param driver_number query int true "车手号码"
// @Param session_key query int false "OpenF1 session_key"
// @Param max_points query int false "最大采样点数（50-5000）" default(240)
// @Success 200 {object} model.GenericObject
// @Failure 400 {object} model.ErrorResponse
// @Failure 502 {object} model.ErrorResponse
// @Failure 503 {object} model.ErrorResponse
// @Router /api/v1/telemetry/fastest_lap [get]
func TelemetryFastestLap(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		if db == nil {
			LogReqError(c, "telemetry_fastest_lap", "mysql_required", nil)
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "mysql_required"})
			return
		}
		dn, err := strconv.Atoi(strings.TrimSpace(c.Query("driver_number")))
		if err != nil || dn < 1 {
			c.JSON(400, model.ErrorResponse{Ok: false, Error: "bad_driver_number"})
			return
		}
		var sk *int
		if s := strings.TrimSpace(c.Query("session_key")); s != "" {
			if n, err := strconv.Atoi(s); err == nil {
				sk = &n
			}
		}
		maxPoints := toIntQuery(c, "max_points", 240)
		if maxPoints < 50 {
			maxPoints = 50
		}
		if maxPoints > 5000 {
			maxPoints = 5000
		}
		res, err := f1db.TelemetryFastestLap(db, dn, sk, maxPoints)
		if err != nil {
			c.JSON(502, model.ErrorResponse{Ok: false, Error: "query_failed"})
			return
		}
		out := model.GenericObject{
			"ok":                 true,
			"found":              res.Found,
			"driver_number":      res.DriverNumber,
			"session_key":        res.SessionKey,
			"lap_number":         res.LapNumber,
			"date_start_utc":     res.DateStartUTC,
			"lap_duration":       res.LapDuration,
			"duration_sector_1":  res.DurationSector1,
			"duration_sector_2":  res.DurationSector2,
			"duration_sector_3":  res.DurationSector3,
			"delta":              res.Delta,
			"delta_s1":           res.DeltaS1,
			"delta_s2":           res.DeltaS2,
			"delta_s3":           res.DeltaS3,
			"is_session_fastest": res.IsSessionFastest,
			"points":             res.Points,
		}
		c.JSON(200, out)
	}
}

// @Summary 指定圈号的控制曲线
// @Tags Telemetry
// @Produce json
// @Param driver_number query int true "车手号码"
// @Param lap_number query int true "圈号"
// @Param session_key query int false "OpenF1 session_key"
// @Param max_points query int false "最大采样点（0 表示默认策略，最大 20000）" default(0)
// @Success 200 {object} model.GenericObject
// @Failure 400 {object} model.ErrorResponse
// @Failure 502 {object} model.ErrorResponse
// @Failure 503 {object} model.ErrorResponse
// @Router /api/v1/telemetry/lap_controls_series [get]
func TelemetryLapControlsSeries(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		if db == nil {
			LogReqError(c, "telemetry_lap_controls_series", "mysql_required", nil)
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "mysql_required"})
			return
		}
		dn, err := strconv.Atoi(strings.TrimSpace(c.Query("driver_number")))
		if err != nil || dn < 1 {
			c.JSON(400, model.ErrorResponse{Ok: false, Error: "bad_driver_number"})
			return
		}
		ln, err := strconv.Atoi(strings.TrimSpace(c.Query("lap_number")))
		if err != nil || ln < 1 {
			c.JSON(400, model.ErrorResponse{Ok: false, Error: "bad_lap_number"})
			return
		}
		var sk *int
		if s := strings.TrimSpace(c.Query("session_key")); s != "" {
			if n, err := strconv.Atoi(s); err == nil {
				sk = &n
			}
		}
		maxPoints := toIntQuery(c, "max_points", 0)
		if maxPoints < 0 {
			maxPoints = 0
		}
		if maxPoints > 20000 {
			maxPoints = 20000
		}

		res, err := f1db.TelemetryLapControlsSeries(db, dn, sk, ln, maxPoints)
		if err != nil {
			c.JSON(502, model.ErrorResponse{Ok: false, Error: "query_failed"})
			return
		}
		found := res.DateStartUTC != nil && res.PointsCount > 0
		c.JSON(200, model.GenericObject{
			"ok":            true,
			"found":         found,
			"driver_number": res.DriverNumber,
			"session_key":   res.SessionKey,
			"lap_number":    res.LapNumber,
			"date_start_utc": func() any {
				if res.DateStartUTC == nil {
					return nil
				}
				return res.DateStartUTC.UTC()
			}(),
			"max_points":   res.MaxPoints,
			"points_count": res.PointsCount,
			"payload":      res.Payload,
		})
	}
}
