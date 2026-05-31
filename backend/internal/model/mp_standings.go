package model

type MpStandingsDriverItem struct {
	Position     int     `json:"position"`
	Points       float64 `json:"points"`
	DriverNumber int     `json:"driver_number"`
	DisplayName  *string `json:"display_name"`
	FullName     *string `json:"full_name"`
	NameAcronym  *string `json:"name_acronym"`
	TeamName     *string `json:"team_name"`
	TeamColor    *string `json:"team_color"`
	HeadshotURL  *string `json:"headshot_url"`
	TeamLogoURL  *string `json:"team_logo_url"`
}

type MpStandingsConstructorItem struct {
	Position    int     `json:"position"`
	Points      float64 `json:"points"`
	TeamName    *string `json:"team_name"`
	TeamColor   *string `json:"team_color"`
	TeamLogoURL *string `json:"team_logo_url"`
}

type MpStandingsResponse struct {
	Ok             bool                         `json:"ok"`
	GeneratedAtUTC string                       `json:"generated_at_utc,omitempty"`
	Season         int                          `json:"season"`
	SessionKey     int                          `json:"session_key"`
	Drivers        []MpStandingsDriverItem      `json:"drivers"`
	Constructors   []MpStandingsConstructorItem `json:"constructors"`
}
