package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"toinc_f1_backend/internal/f1db"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func TelemetryLapsAvailable(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		if db == nil {
			LogReqError(c, "telemetry_laps_available", "mysql_required", nil)
			c.JSON(http.StatusServiceUnavailable, gin.H{"ok": false, "error": "mysql_required"})
			return
		}
		items, err := f1db.TelemetryLapsAvailable(db)
		if err != nil {
			c.JSON(502, gin.H{"ok": false, "error": "query_failed"})
			return
		}
		c.JSON(200, gin.H{"ok": true, "items": items})
	}
}

func TelemetryLaps(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		if db == nil {
			LogReqError(c, "telemetry_laps", "mysql_required", nil)
			c.JSON(http.StatusServiceUnavailable, gin.H{"ok": false, "error": "mysql_required"})
			return
		}
		dn, err := strconv.Atoi(strings.TrimSpace(c.Query("driver_number")))
		if err != nil || dn < 1 {
			c.JSON(400, gin.H{"ok": false, "error": "bad_driver_number"})
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
			c.JSON(502, gin.H{"ok": false, "error": "query_failed"})
			return
		}
		c.JSON(200, gin.H{"ok": true, "driver_number": dn, "session_key": sk2, "laps": laps})
	}
}

func TelemetryLapControls(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		if db == nil {
			LogReqError(c, "telemetry_lap_controls", "mysql_required", nil)
			c.JSON(http.StatusServiceUnavailable, gin.H{"ok": false, "error": "mysql_required"})
			return
		}
		dn, err := strconv.Atoi(strings.TrimSpace(c.Query("driver_number")))
		if err != nil || dn < 1 {
			c.JSON(400, gin.H{"ok": false, "error": "bad_driver_number"})
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
			c.JSON(502, gin.H{"ok": false, "error": "query_failed"})
			return
		}
		c.JSON(200, gin.H{"ok": true, "driver_number": dn, "session_key": sk2, "items": items})
	}
}

func TelemetryLapTrace(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		if db == nil {
			LogReqError(c, "telemetry_lap_trace", "mysql_required", nil)
			c.JSON(http.StatusServiceUnavailable, gin.H{"ok": false, "error": "mysql_required"})
			return
		}
		dn, err := strconv.Atoi(strings.TrimSpace(c.Query("driver_number")))
		if err != nil || dn < 1 {
			c.JSON(400, gin.H{"ok": false, "error": "bad_driver_number"})
			return
		}
		ln, err := strconv.Atoi(strings.TrimSpace(c.Query("lap_number")))
		if err != nil || ln < 1 {
			c.JSON(400, gin.H{"ok": false, "error": "bad_lap_number"})
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
			c.JSON(502, gin.H{"ok": false, "error": "query_failed"})
			return
		}
		var startISO any = nil
		if start != nil {
			startISO = start.UTC()
		}
		c.JSON(200, gin.H{
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

func TelemetryFastestLap(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		if db == nil {
			LogReqError(c, "telemetry_fastest_lap", "mysql_required", nil)
			c.JSON(http.StatusServiceUnavailable, gin.H{"ok": false, "error": "mysql_required"})
			return
		}
		dn, err := strconv.Atoi(strings.TrimSpace(c.Query("driver_number")))
		if err != nil || dn < 1 {
			c.JSON(400, gin.H{"ok": false, "error": "bad_driver_number"})
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
			c.JSON(502, gin.H{"ok": false, "error": "query_failed"})
			return
		}
		out := gin.H{
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

func TelemetryLapControlsSeries(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		if db == nil {
			LogReqError(c, "telemetry_lap_controls_series", "mysql_required", nil)
			c.JSON(http.StatusServiceUnavailable, gin.H{"ok": false, "error": "mysql_required"})
			return
		}
		dn, err := strconv.Atoi(strings.TrimSpace(c.Query("driver_number")))
		if err != nil || dn < 1 {
			c.JSON(400, gin.H{"ok": false, "error": "bad_driver_number"})
			return
		}
		ln, err := strconv.Atoi(strings.TrimSpace(c.Query("lap_number")))
		if err != nil || ln < 1 {
			c.JSON(400, gin.H{"ok": false, "error": "bad_lap_number"})
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
			c.JSON(502, gin.H{"ok": false, "error": "query_failed"})
			return
		}
		found := res.DateStartUTC != nil && res.PointsCount > 0
		c.JSON(200, gin.H{
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
