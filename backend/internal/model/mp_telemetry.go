package model

type MpTelemetryControlsPoint struct {
	T        float64 `json:"t"`
	Throttle int     `json:"throttle"`
	Brake    int     `json:"brake"`
}

type MpTelemetryControlsResponse struct {
	Ok             bool                       `json:"ok"`
	GeneratedAtUTC string                     `json:"generated_at_utc,omitempty"`
	SessionKey     int                        `json:"session_key"`
	DriverNumber   int                        `json:"driver_number"`
	LapMode        string                     `json:"lap_mode"`
	LapNumber      *int                       `json:"lap_number,omitempty"`
	LapTime        *string                    `json:"lap_time,omitempty"`
	LapStartUTC    *string                    `json:"lap_start_utc,omitempty"`
	LapEndUTC      *string                    `json:"lap_end_utc,omitempty"`
	Points         []MpTelemetryControlsPoint `json:"points"`
}

type MpTelemetrySectorControlsPoint struct {
	X        float64  `json:"x"`
	Sector   int      `json:"sector"`
	TMs      int      `json:"t_ms"`
	Speed    *float64 `json:"speed,omitempty"`
	Throttle *float64 `json:"throttle,omitempty"`
	Brake    *float64 `json:"brake,omitempty"`
}

type MpTelemetrySectorControlsResponse struct {
	Ok             bool    `json:"ok"`
	GeneratedAtUTC string  `json:"generated_at_utc"`
	SessionKey     int     `json:"session_key"`
	DriverNumber   int     `json:"driver_number"`
	LapMode        string  `json:"lap_mode"`
	LapNumber      *int    `json:"lap_number,omitempty"`
	LapTime        *string `json:"lap_time,omitempty"`

	X        []string   `json:"x,omitempty"`
	Throttle []*float64 `json:"throttle,omitempty"`
	Brake    []*float64 `json:"brake,omitempty"`
	Speed    []*float64 `json:"speed,omitempty"`

	XLabels     []string                         `json:"x_labels,omitempty"`
	XMin        *int                             `json:"x_min,omitempty"`
	XMax        *int                             `json:"x_max,omitempty"`
	S1EndI      *int                             `json:"s1_end_i,omitempty"`
	S2EndI      *int                             `json:"s2_end_i,omitempty"`
	PointsCount *int                             `json:"points_count,omitempty"`
	Points      []MpTelemetrySectorControlsPoint `json:"points,omitempty"`
}
