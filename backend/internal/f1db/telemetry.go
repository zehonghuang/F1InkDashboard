package f1db

import (
	"encoding/json"
	"errors"
	"math"
	"time"

	"gorm.io/gorm"
)

type TelemetryAvailableItem struct {
	DriverNumber     int  `json:"driver_number"`
	LatestSessionKey *int `json:"latest_session_key"`
	RowCount         int  `json:"row_count"`
}

func TelemetryLapsAvailable(db *gorm.DB) ([]TelemetryAvailableItem, error) {
	type row struct {
		DriverNumber     int  `gorm:"column:driver_number"`
		LatestSessionKey *int `gorm:"column:latest_session_key"`
		RowCount         int  `gorm:"column:row_count"`
	}
	var rows []row
	if err := db.Raw(`
        SELECT driver_number, MAX(session_key) AS latest_session_key, COUNT(*) AS row_count
        FROM openf1_laps
        GROUP BY driver_number
        ORDER BY driver_number ASC
    `).Scan(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]TelemetryAvailableItem, 0, len(rows))
	for _, it := range rows {
		out = append(out, TelemetryAvailableItem{
			DriverNumber:     it.DriverNumber,
			LatestSessionKey: it.LatestSessionKey,
			RowCount:         it.RowCount,
		})
	}
	return out, nil
}

func LatestTelemetrySessionKey(db *gorm.DB, driverNumber int) (*int, error) {
	type row struct {
		Sk *int `gorm:"column:sk"`
	}
	var r row
	if err := db.Raw(`
        SELECT MAX(session_key) AS sk
        FROM openf1_laps
        WHERE driver_number = ? AND session_key IS NOT NULL
    `, driverNumber).Scan(&r).Error; err != nil {
		return nil, err
	}
	return r.Sk, nil
}

type TelemetryLapRow struct {
	LapNumber       int        `json:"lap_number"`
	DateStartUTC    *time.Time `json:"date_start_utc"`
	LapDuration     *float64   `json:"lap_duration"`
	DurationSector1 *float64   `json:"duration_sector_1"`
	DurationSector2 *float64   `json:"duration_sector_2"`
	DurationSector3 *float64   `json:"duration_sector_3"`
	I1Speed         *int       `json:"i1_speed"`
	I2Speed         *int       `json:"i2_speed"`
	StSpeed         *int       `json:"st_speed"`
	IsPitOutLap     *bool      `json:"is_pit_out_lap"`
}

func TelemetryLaps(db *gorm.DB, driverNumber int, sessionKey *int) (*int, []TelemetryLapRow, error) {
	if sessionKey == nil {
		sk, err := LatestTelemetrySessionKey(db, driverNumber)
		if err != nil {
			return nil, nil, err
		}
		sessionKey = sk
	}
	if sessionKey == nil {
		return nil, []TelemetryLapRow{}, nil
	}
	var rows []TelemetryLapRow
	if err := db.Raw(`
        SELECT
          lap_number,
          date_start_utc,
          lap_duration,
          duration_sector_1,
          duration_sector_2,
          duration_sector_3,
          i1_speed,
          i2_speed,
          st_speed,
          is_pit_out_lap
        FROM openf1_laps
        WHERE driver_number = ? AND session_key = ?
        ORDER BY lap_number ASC
    `, driverNumber, *sessionKey).Scan(&rows).Error; err != nil {
		return sessionKey, nil, err
	}
	return sessionKey, rows, nil
}

type TelemetryLapControlItem struct {
	LapNumber    int        `json:"lap_number"`
	DateStartUTC *time.Time `json:"date_start_utc"`
	ThrottleAvg  *float64   `json:"throttle_avg"`
	BrakeAvg     *float64   `json:"brake_avg"`
}

type carPoint struct {
	DateUTC  time.Time `gorm:"column:date_utc"`
	Throttle *float64  `gorm:"column:throttle"`
	Brake    *float64  `gorm:"column:brake"`
}

func TelemetryLapControls(db *gorm.DB, driverNumber int, sessionKey *int) (*int, []TelemetryLapControlItem, error) {
	if sessionKey == nil {
		sk, err := LatestTelemetrySessionKey(db, driverNumber)
		if err != nil {
			return nil, nil, err
		}
		sessionKey = sk
	}
	if sessionKey == nil {
		return nil, []TelemetryLapControlItem{}, nil
	}

	type lapMeta struct {
		LapNumber    int        `gorm:"column:lap_number"`
		DateStartUTC *time.Time `gorm:"column:date_start_utc"`
		LapDuration  *float64   `gorm:"column:lap_duration"`
	}
	var laps []lapMeta
	if err := db.Raw(`
        SELECT lap_number, date_start_utc, lap_duration
        FROM openf1_laps
        WHERE driver_number = ? AND session_key = ?
        ORDER BY lap_number ASC
    `, driverNumber, *sessionKey).Scan(&laps).Error; err != nil {
		return sessionKey, nil, err
	}
	if len(laps) == 0 {
		return sessionKey, []TelemetryLapControlItem{}, nil
	}

	var start0 *time.Time
	var endLast *time.Time
	for _, it := range laps {
		if it.DateStartUTC == nil || it.LapDuration == nil || !(*it.LapDuration > 0) {
			continue
		}
		s := it.DateStartUTC.UTC()
		e := s.Add(time.Duration(*it.LapDuration * float64(time.Second)))
		if start0 == nil || s.Before(*start0) {
			tmp := s
			start0 = &tmp
		}
		if endLast == nil || e.After(*endLast) {
			tmp := e
			endLast = &tmp
		}
	}
	if start0 == nil || endLast == nil {
		return sessionKey, []TelemetryLapControlItem{}, nil
	}

	var points []carPoint
	if err := db.Raw(`
        SELECT date_utc, throttle, brake
        FROM openf1_car_data
        WHERE driver_number = ? AND session_key = ? AND date_utc >= ? AND date_utc <= ?
        ORDER BY date_utc ASC
    `, driverNumber, *sessionKey, *start0, *endLast).Scan(&points).Error; err != nil {
		return sessionKey, nil, err
	}

	out := make([]TelemetryLapControlItem, 0, len(laps))
	pi := 0
	for _, lap := range laps {
		if lap.DateStartUTC == nil || lap.LapDuration == nil || !(*lap.LapDuration > 0) {
			out = append(out, TelemetryLapControlItem{LapNumber: lap.LapNumber, DateStartUTC: lap.DateStartUTC})
			continue
		}
		start := lap.DateStartUTC.UTC()
		end := start.Add(time.Duration(*lap.LapDuration * float64(time.Second)))

		for pi < len(points) && points[pi].DateUTC.Before(start) {
			pi++
		}
		sumT := 0.0
		cntT := 0
		sumB := 0.0
		cntB := 0
		pj := pi
		for pj < len(points) && (points[pj].DateUTC.Equal(start) || points[pj].DateUTC.Before(end) || points[pj].DateUTC.Equal(end)) {
			if points[pj].Throttle != nil {
				sumT += *points[pj].Throttle
				cntT++
			}
			if points[pj].Brake != nil {
				sumB += *points[pj].Brake
				cntB++
			}
			pj++
		}
		var avgT *float64
		var avgB *float64
		if cntT > 0 {
			v := math.Round((sumT/float64(cntT))*100) / 100
			avgT = &v
		}
		if cntB > 0 {
			v := math.Round((sumB/float64(cntB))*100) / 100
			avgB = &v
		}
		out = append(out, TelemetryLapControlItem{
			LapNumber:    lap.LapNumber,
			DateStartUTC: lap.DateStartUTC,
			ThrottleAvg:  avgT,
			BrakeAvg:     avgB,
		})
	}

	return sessionKey, out, nil
}

type TelemetryPoint struct {
	TS       float64  `json:"t_s"`
	Throttle *float64 `json:"throttle"`
	Brake    *float64 `json:"brake"`
}

func TelemetryLapTrace(db *gorm.DB, driverNumber int, sessionKey *int, lapNumber int, maxPoints int) (*int, *time.Time, *float64, []TelemetryPoint, error) {
	if sessionKey == nil {
		sk, err := LatestTelemetrySessionKey(db, driverNumber)
		if err != nil {
			return nil, nil, nil, nil, err
		}
		sessionKey = sk
	}
	if sessionKey == nil {
		return nil, nil, nil, []TelemetryPoint{}, nil
	}
	type lapRow struct {
		DateStartUTC *time.Time `gorm:"column:date_start_utc"`
		LapDuration  *float64   `gorm:"column:lap_duration"`
	}
	var lap lapRow
	if err := db.Raw(`
        SELECT date_start_utc, lap_duration
        FROM openf1_laps
        WHERE driver_number = ? AND session_key = ? AND lap_number = ?
        ORDER BY date_start_utc ASC
        LIMIT 1
    `, driverNumber, *sessionKey, lapNumber).Scan(&lap).Error; err != nil {
		return sessionKey, nil, nil, nil, err
	}
	if lap.DateStartUTC == nil || lap.LapDuration == nil || !(*lap.LapDuration > 0) {
		return sessionKey, nil, nil, []TelemetryPoint{}, nil
	}
	start := lap.DateStartUTC.UTC()
	end := start.Add(time.Duration(*lap.LapDuration * float64(time.Second)))

	var pointsRaw []carPoint
	if err := db.Raw(`
        SELECT date_utc, throttle, brake
        FROM openf1_car_data
        WHERE driver_number = ? AND session_key = ? AND date_utc >= ? AND date_utc <= ?
        ORDER BY date_utc ASC
    `, driverNumber, *sessionKey, start, end).Scan(&pointsRaw).Error; err != nil {
		return sessionKey, &start, lap.LapDuration, nil, err
	}

	out := make([]TelemetryPoint, 0, len(pointsRaw))
	for _, p := range pointsRaw {
		t := p.DateUTC.Sub(start).Seconds()
		t = math.Round(t*1000) / 1000
		out = append(out, TelemetryPoint{TS: t, Throttle: p.Throttle, Brake: p.Brake})
	}
	if maxPoints <= 0 {
		maxPoints = 600
	}
	if len(out) > maxPoints {
		step := len(out) / maxPoints
		if step < 1 {
			step = 1
		}
		sampled := make([]TelemetryPoint, 0, maxPoints+1)
		for i := 0; i < len(out); i += step {
			sampled = append(sampled, out[i])
		}
		out = sampled
	}

	dur := math.Round((*lap.LapDuration)*1000) / 1000
	return sessionKey, &start, &dur, out, nil
}

type FastestLapResult struct {
	Found            bool             `json:"found"`
	DriverNumber     int              `json:"driver_number"`
	SessionKey       *int             `json:"session_key"`
	LapNumber        *int             `json:"lap_number"`
	DateStartUTC     *time.Time       `json:"date_start_utc"`
	LapDuration      *float64         `json:"lap_duration"`
	DurationSector1  *float64         `json:"duration_sector_1"`
	DurationSector2  *float64         `json:"duration_sector_2"`
	DurationSector3  *float64         `json:"duration_sector_3"`
	Delta            *float64         `json:"delta"`
	DeltaS1          *float64         `json:"delta_s1"`
	DeltaS2          *float64         `json:"delta_s2"`
	DeltaS3          *float64         `json:"delta_s3"`
	IsSessionFastest bool             `json:"is_session_fastest"`
	Points           []TelemetryPoint `json:"points"`
}

func TelemetryFastestLap(db *gorm.DB, driverNumber int, sessionKey *int, maxPoints int) (FastestLapResult, error) {
	if sessionKey == nil {
		sk, err := LatestTelemetrySessionKey(db, driverNumber)
		if err != nil {
			return FastestLapResult{}, err
		}
		sessionKey = sk
	}
	if sessionKey == nil {
		return FastestLapResult{Found: false, DriverNumber: driverNumber, SessionKey: nil, Points: []TelemetryPoint{}}, nil
	}
	sk := *sessionKey

	type bestLap struct {
		LapNumber    int        `gorm:"column:lap_number"`
		DateStartUTC *time.Time `gorm:"column:date_start_utc"`
		LapDuration  *float64   `gorm:"column:lap_duration"`
		S1           *float64   `gorm:"column:duration_sector_1"`
		S2           *float64   `gorm:"column:duration_sector_2"`
		S3           *float64   `gorm:"column:duration_sector_3"`
	}
	var best bestLap
	if err := db.Raw(`
        SELECT
          lap_number,
          date_start_utc,
          lap_duration,
          duration_sector_1,
          duration_sector_2,
          duration_sector_3
        FROM openf1_laps
        WHERE driver_number = ? AND session_key = ?
          AND lap_duration IS NOT NULL AND lap_duration > 0
        ORDER BY (is_pit_out_lap=1) ASC, lap_duration ASC, lap_number ASC, date_start_utc ASC
        LIMIT 1
    `, driverNumber, sk).Scan(&best).Error; err != nil {
		return FastestLapResult{}, err
	}
	if best.DateStartUTC == nil || best.LapDuration == nil || !(*best.LapDuration > 0) {
		return FastestLapResult{Found: false, DriverNumber: driverNumber, SessionKey: sessionKey, Points: []TelemetryPoint{}}, nil
	}

	type sessBest struct {
		LapDuration *float64 `gorm:"column:lap_duration"`
	}
	var sb sessBest
	_ = db.Raw(`
        SELECT lap_duration
        FROM openf1_laps
        WHERE session_key = ?
          AND lap_duration IS NOT NULL AND lap_duration > 0
          AND (is_pit_out_lap IS NULL OR is_pit_out_lap=0)
        ORDER BY lap_duration ASC
        LIMIT 1
    `, sk).Scan(&sb).Error

	type sectorBest struct {
		S1 *float64 `gorm:"column:s1"`
		S2 *float64 `gorm:"column:s2"`
		S3 *float64 `gorm:"column:s3"`
	}
	var sec sectorBest
	_ = db.Raw(`
        SELECT
          MIN(CASE WHEN duration_sector_1 IS NOT NULL AND duration_sector_1 > 0 THEN duration_sector_1 END) AS s1,
          MIN(CASE WHEN duration_sector_2 IS NOT NULL AND duration_sector_2 > 0 THEN duration_sector_2 END) AS s2,
          MIN(CASE WHEN duration_sector_3 IS NOT NULL AND duration_sector_3 > 0 THEN duration_sector_3 END) AS s3
        FROM openf1_laps
        WHERE session_key = ?
          AND lap_duration IS NOT NULL AND lap_duration > 0
          AND (is_pit_out_lap IS NULL OR is_pit_out_lap=0)
    `, sk).Scan(&sec).Error

	res := FastestLapResult{
		Found:        true,
		DriverNumber: driverNumber,
		SessionKey:   sessionKey,
		LapNumber:    &best.LapNumber,
		DateStartUTC: best.DateStartUTC,
		Points:       []TelemetryPoint{},
	}
	dur := math.Round((*best.LapDuration)*1000) / 1000
	res.LapDuration = &dur
	res.DurationSector1 = round3(best.S1)
	res.DurationSector2 = round3(best.S2)
	res.DurationSector3 = round3(best.S3)

	if sb.LapDuration != nil {
		d := math.Round((dur-*sb.LapDuration)*1000) / 1000
		res.Delta = &d
		res.IsSessionFastest = math.Abs(d) < 1e-6
	}
	res.DeltaS1 = delta3(best.S1, sec.S1)
	res.DeltaS2 = delta3(best.S2, sec.S2)
	res.DeltaS3 = delta3(best.S3, sec.S3)

	start := best.DateStartUTC.UTC()
	end := start.Add(time.Duration(dur * float64(time.Second)))
	var pointsRaw []carPoint
	if err := db.Raw(`
        SELECT date_utc, throttle, brake
        FROM openf1_car_data
        WHERE driver_number = ? AND session_key = ? AND date_utc >= ? AND date_utc <= ?
        ORDER BY date_utc ASC
    `, driverNumber, sk, start, end).Scan(&pointsRaw).Error; err != nil {
		return FastestLapResult{}, err
	}

	out := make([]TelemetryPoint, 0, len(pointsRaw))
	for _, p := range pointsRaw {
		t := p.DateUTC.Sub(start).Seconds()
		t = math.Round(t*1000) / 1000
		out = append(out, TelemetryPoint{TS: t, Throttle: p.Throttle, Brake: p.Brake})
	}
	if maxPoints <= 0 {
		maxPoints = 240
	}
	if len(out) > maxPoints {
		step := len(out) / maxPoints
		if step < 1 {
			step = 1
		}
		sampled := make([]TelemetryPoint, 0, maxPoints+1)
		for i := 0; i < len(out); i += step {
			sampled = append(sampled, out[i])
		}
		out = sampled
	}
	res.Points = out
	return res, nil
}

func round3(v *float64) *float64 {
	if v == nil {
		return nil
	}
	if !(*v > 0) {
		return nil
	}
	x := math.Round((*v)*1000) / 1000
	return &x
}

func delta3(v *float64, best *float64) *float64 {
	if v == nil || best == nil {
		return nil
	}
	if !(*v > 0) || !(*best > 0) {
		return nil
	}
	d := math.Round(((*v)-(*best))*1000) / 1000
	return &d
}

func RequireDB(db *gorm.DB) error {
	if db == nil {
		return errors.New("mysql_disabled")
	}
	return nil
}

type TelemetryLapControlsSeriesResult struct {
	SessionKey   *int            `json:"session_key"`
	DriverNumber int             `json:"driver_number"`
	LapNumber    int             `json:"lap_number"`
	DateStartUTC *time.Time      `json:"date_start_utc"`
	MaxPoints    int             `json:"max_points"`
	PointsCount  int             `json:"points_count"`
	Payload      json.RawMessage `json:"payload"`
}

func TelemetryLapControlsSeries(db *gorm.DB, driverNumber int, sessionKey *int, lapNumber int, maxPoints int) (TelemetryLapControlsSeriesResult, error) {
	if sessionKey == nil {
		sk, err := LatestTelemetrySessionKey(db, driverNumber)
		if err != nil {
			return TelemetryLapControlsSeriesResult{}, err
		}
		sessionKey = sk
	}
	if sessionKey == nil {
		return TelemetryLapControlsSeriesResult{SessionKey: nil, DriverNumber: driverNumber, LapNumber: lapNumber, Payload: json.RawMessage("null")}, nil
	}
	if maxPoints < 0 {
		maxPoints = 0
	}
	maxPointsCompute := maxPoints
	if maxPointsCompute <= 0 {
		maxPointsCompute = 900
	}
	if maxPointsCompute > 20000 {
		maxPointsCompute = 20000
	}

	type row struct {
		SessionKey   int        `gorm:"column:session_key"`
		DriverNumber int        `gorm:"column:driver_number"`
		LapNumber    int        `gorm:"column:lap_number"`
		DateStartUTC *time.Time `gorm:"column:date_start_utc"`
		MaxPoints    int        `gorm:"column:max_points"`
		PointsCount  int        `gorm:"column:points_count"`
		PayloadJSON  []byte     `gorm:"column:payload_json"`
	}

	var r row
	if maxPoints > 0 {
		_ = db.Raw(`
        SELECT session_key, driver_number, lap_number, date_start_utc, max_points, points_count, payload_json
        FROM openf1_lap_controls_series
        WHERE session_key = ? AND driver_number = ? AND lap_number = ? AND max_points = ?
        ORDER BY date_start_utc ASC
        LIMIT 1
    `, *sessionKey, driverNumber, lapNumber, maxPoints).Scan(&r).Error
	}
	if r.SessionKey == 0 {
		if err := db.Raw(`
        SELECT session_key, driver_number, lap_number, date_start_utc, max_points, points_count, payload_json
        FROM openf1_lap_controls_series
        WHERE session_key = ? AND driver_number = ? AND lap_number = ?
        ORDER BY max_points DESC, date_start_utc ASC
        LIMIT 1
    `, *sessionKey, driverNumber, lapNumber).Scan(&r).Error; err != nil {
			return TelemetryLapControlsSeriesResult{}, err
		}
	}
	if r.DateStartUTC == nil || r.PointsCount <= 0 || len(r.PayloadJSON) == 0 {
		type lapMeta struct {
			DateStartUTC *time.Time `gorm:"column:date_start_utc"`
			LapDuration  *float64   `gorm:"column:lap_duration"`
			S1           *float64   `gorm:"column:duration_sector_1"`
			S2           *float64   `gorm:"column:duration_sector_2"`
			S3           *float64   `gorm:"column:duration_sector_3"`
		}
		var meta lapMeta
		if err := db.Raw(`
        SELECT date_start_utc, lap_duration, duration_sector_1, duration_sector_2, duration_sector_3
        FROM openf1_laps
        WHERE session_key = ? AND driver_number = ? AND lap_number = ?
        ORDER BY date_start_utc ASC
        LIMIT 1
    `, *sessionKey, driverNumber, lapNumber).Scan(&meta).Error; err != nil {
			return TelemetryLapControlsSeriesResult{}, err
		}
		if meta.DateStartUTC == nil || meta.LapDuration == nil || !(*meta.LapDuration > 0) {
			out := TelemetryLapControlsSeriesResult{
				SessionKey:   sessionKey,
				DriverNumber: driverNumber,
				LapNumber:    lapNumber,
				DateStartUTC: meta.DateStartUTC,
				MaxPoints:    0,
				PointsCount:  0,
				Payload:      json.RawMessage("null"),
			}
			return out, nil
		}

		start := meta.DateStartUTC.UTC()
		end := start.Add(time.Duration(*meta.LapDuration * float64(time.Second)))

		type carRow struct {
			DateUTC  time.Time `gorm:"column:date_utc"`
			Speed    *int      `gorm:"column:speed"`
			Throttle *int      `gorm:"column:throttle"`
			Brake    *int      `gorm:"column:brake"`
		}
		var carRows []carRow
		if err := db.Raw(`
        SELECT date_utc, speed, throttle, brake
        FROM openf1_car_data
        WHERE session_key = ? AND driver_number = ? AND date_utc >= ? AND date_utc <= ?
        ORDER BY date_utc ASC
    `, *sessionKey, driverNumber, start, end).Scan(&carRows).Error; err != nil {
			return TelemetryLapControlsSeriesResult{}, err
		}

		points := make([][]any, 0, len(carRows))
		var lastT *int
		for _, it := range carRows {
			tms := int(math.Round(it.DateUTC.Sub(start).Seconds() * 1000.0))
			if tms < 0 {
				continue
			}
			var sp any = nil
			var th any = nil
			var br any = nil
			if it.Speed != nil {
				sp = int(*it.Speed)
			}
			if it.Throttle != nil {
				th = int(*it.Throttle)
			}
			if it.Brake != nil {
				br = int(*it.Brake)
			}
			if lastT != nil && *lastT == tms && len(points) > 0 {
				points[len(points)-1] = []any{tms, sp, th, br}
			} else {
				points = append(points, []any{tms, sp, th, br})
				tmp := tms
				lastT = &tmp
			}
		}

		if maxPointsCompute > 0 && len(points) > maxPointsCompute {
			step := len(points) / maxPointsCompute
			if step < 1 {
				step = 1
			}
			sampled := make([][]any, 0, maxPointsCompute+1)
			for i := 0; i < len(points); i += step {
				sampled = append(sampled, points[i])
			}
			if len(sampled) > 0 && sampled[len(sampled)-1][0] != points[len(points)-1][0] {
				sampled = append(sampled, points[len(points)-1])
			}
			points = sampled
		}

		var s1ms any = nil
		var s2ms any = nil
		if meta.S1 != nil && *meta.S1 > 0 {
			s1ms = int(math.Round((*meta.S1) * 1000.0))
		}
		if meta.S1 != nil && meta.S2 != nil && *meta.S1 > 0 && *meta.S2 > 0 {
			s2ms = int(math.Round(((*meta.S1) + (*meta.S2)) * 1000.0))
		}

		findEndIndex := func(endMs any) any {
			ms, ok := endMs.(int)
			if !ok || ms <= 0 {
				return nil
			}
			for i, p := range points {
				if len(p) < 1 {
					continue
				}
				t0, _ := p[0].(int)
				if t0 >= ms {
					return i
				}
			}
			if len(points) > 0 {
				return len(points) - 1
			}
			return 0
		}

		s1i := findEndIndex(s1ms)
		s2i := findEndIndex(s2ms)

		payloadMap := map[string]any{
			"v":         1,
			"t_end_ms":  int(math.Round((*meta.LapDuration) * 1000.0)),
			"s1_end_ms": s1ms,
			"s2_end_ms": s2ms,
			"s1_end_i":  s1i,
			"s2_end_i":  s2i,
			"points":    points,
			"units": map[string]any{
				"speed":    "kmh",
				"throttle": "pct",
				"brake":    "pct",
			},
		}
		b, err := json.Marshal(payloadMap)
		if err != nil {
			return TelemetryLapControlsSeriesResult{}, err
		}

		pointsCount := len(points)
		_ = db.Exec(`
        INSERT INTO openf1_lap_controls_series
          (session_key, driver_number, lap_number, date_start_utc,
           lap_duration, duration_sector_1, duration_sector_2, duration_sector_3,
           max_points, points_count, payload_json)
        VALUES
          (?,?,?,?,?,?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE
          lap_duration=VALUES(lap_duration),
          duration_sector_1=VALUES(duration_sector_1),
          duration_sector_2=VALUES(duration_sector_2),
          duration_sector_3=VALUES(duration_sector_3),
          max_points=VALUES(max_points),
          points_count=VALUES(points_count),
          payload_json=VALUES(payload_json)
    `, *sessionKey, driverNumber, lapNumber, start, meta.LapDuration, meta.S1, meta.S2, meta.S3, maxPointsCompute, pointsCount, string(b)).Error

		r.SessionKey = *sessionKey
		r.DriverNumber = driverNumber
		r.LapNumber = lapNumber
		r.DateStartUTC = &start
		r.MaxPoints = maxPointsCompute
		r.PointsCount = pointsCount
		r.PayloadJSON = b
	}

	out := TelemetryLapControlsSeriesResult{
		SessionKey:   sessionKey,
		DriverNumber: driverNumber,
		LapNumber:    lapNumber,
		DateStartUTC: r.DateStartUTC,
		MaxPoints:    r.MaxPoints,
		PointsCount:  r.PointsCount,
		Payload:      json.RawMessage("null"),
	}
	if len(r.PayloadJSON) > 0 {
		out.Payload = json.RawMessage(r.PayloadJSON)
	}
	return out, nil
}
