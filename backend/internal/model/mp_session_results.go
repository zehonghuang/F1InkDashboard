package model

type MpSessionResultItem struct {
	DriverNumber int      `json:"driver_number"`
	DriverName   *string  `json:"driver_name"`
	FullName     *string  `json:"full_name"`
	Position     int      `json:"position"`
	TeamName     *string  `json:"team_name"`
	TeamColor    *string  `json:"team_color"`
	TeamLogoURL  *string  `json:"team_logo_url"`
	HeadshotURL  *string  `json:"headshot_url"`
	NameAcronym  *string  `json:"name_acronym"`
	LapTime      *string  `json:"lap_time"`
	LapSeconds   *float64 `json:"lap_seconds"`
}

type MpSessionResultsResponse struct {
	Ok             bool                  `json:"ok"`
	GeneratedAtUTC string                `json:"generated_at_utc,omitempty"`
	SessionKey     int                   `json:"session_key"`
	Items          []MpSessionResultItem `json:"items"`
}
