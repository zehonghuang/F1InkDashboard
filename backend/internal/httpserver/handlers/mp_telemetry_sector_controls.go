package handlers

import (
	"encoding/json"
	"math"
	"net/http"
	"strings"
	"time"

	"toinc_f1_backend/internal/f1db"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func MpTelemetrySectorControls(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		if db == nil {
			LogReqError(c, "mp_telemetry_sector_controls", "mysql_required", nil)
			c.JSON(http.StatusServiceUnavailable, gin.H{"ok": false, "error": "mysql_required"})
			return
		}
		sessionKey := toIntQuery(c, "session_key", 0)
		driverNumber := toIntQuery(c, "driver_number", 0)
		if sessionKey <= 0 || driverNumber <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "session_key_and_driver_number_required"})
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
			c.JSON(200, gin.H{
				"ok":               true,
				"generated_at_utc": time.Now().UTC().Format(time.RFC3339Nano),
				"session_key":      sessionKey,
				"driver_number":    driverNumber,
				"lap_mode":         lapMode,
				"lap_number":       nil,
				"lap_time":         nil,
				"x":                []string{"S1", "S2", "S3"},
				"throttle":         []any{nil, nil, nil},
				"brake":            []any{nil, nil, nil},
				"speed":            []any{nil, nil, nil},
			})
			return
		}

		sk := sessionKey
		series, err := f1db.TelemetryLapControlsSeries(db, driverNumber, &sk, chosenLapNumber, maxPoints)
		if err != nil {
			c.JSON(502, gin.H{"ok": false, "error": "query_failed"})
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
			c.JSON(200, gin.H{
				"ok":               true,
				"generated_at_utc": time.Now().UTC().Format(time.RFC3339Nano),
				"session_key":      sessionKey,
				"driver_number":    driverNumber,
				"lap_mode":         lapMode,
				"lap_number":       chosenLapNumber,
				"lap_time": func() any {
					if lapDurationSec > 0 {
						return formatLapDurationSimple(lapDurationSec)
					}
					return nil
				}(),
				"x":        []string{"S1", "S2", "S3"},
				"throttle": []any{nil, nil, nil},
				"brake":    []any{nil, nil, nil},
				"speed":    []any{nil, nil, nil},
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

		numOrNil := func(v any) any {
			if v == nil {
				return nil
			}
			f, ok := v.(float64)
			if !ok || math.IsNaN(f) {
				return nil
			}
			return f
		}

		outPoints := make([]any, 0, len(points))
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

			var speed any = nil
			var throttle any = nil
			var brake any = nil
			if len(pt) > 1 {
				speed = numOrNil(pt[1])
			}
			if len(pt) > 2 {
				throttle = numOrNil(pt[2])
			}
			if len(pt) > 3 {
				brake = numOrNil(pt[3])
			}

			outPoints = append(outPoints, gin.H{
				"x":        x,
				"sector":   sector,
				"t_ms":     int(math.Round(tms)),
				"speed":    speed,
				"throttle": throttle,
				"brake":    brake,
			})
		}

		c.JSON(200, gin.H{
			"ok":               true,
			"generated_at_utc": time.Now().UTC().Format(time.RFC3339Nano),
			"session_key":      sessionKey,
			"driver_number":    driverNumber,
			"lap_mode":         lapMode,
			"lap_number":       chosenLapNumber,
			"lap_time": func() any {
				if lapDurationSec > 0 {
					return formatLapDurationSimple(lapDurationSec)
				}
				return nil
			}(),
			"x_labels":     []string{"S1", "S2", "S3"},
			"x_min":        0,
			"x_max":        3,
			"s1_end_i":     i1,
			"s2_end_i":     i2,
			"points_count": len(outPoints),
			"points":       outPoints,
		})
	}
}
