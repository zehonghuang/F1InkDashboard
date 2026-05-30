package model

type MpArchiveCircuit struct {
	CircuitID   string  `json:"circuit_id"`
	CircuitName string  `json:"circuit_name"`
	MapImageURL *string `json:"map_image_url"`
}

type MpArchivePerson struct {
	DriverNumber *int    `json:"driver_number,omitempty"`
	FullName     *string `json:"full_name"`
	NameAcronym  *string `json:"name_acronym"`
}

type MpArchiveFastestLap struct {
	DriverNumber *int     `json:"driver_number,omitempty"`
	FullName     *string  `json:"full_name"`
	NameAcronym  *string  `json:"name_acronym"`
	Time         *string  `json:"time"`
	Seconds      *float64 `json:"seconds"`
}

type MpArchiveRaceItem struct {
	Season               int                 `json:"season"`
	Round                int                 `json:"round"`
	RaceName             string              `json:"race_name"`
	DateISO              string              `json:"date_iso"`
	DateLocal            string              `json:"date_local"`
	OpenF1RaceSessionKey *int                `json:"openf1_race_session_key,omitempty"`
	Circuit              MpArchiveCircuit    `json:"circuit"`
	Winner               MpArchivePerson     `json:"winner"`
	FastestLap           MpArchiveFastestLap `json:"fastest_lap"`
}

type MpArchiveResponse struct {
	Ok             bool                `json:"ok"`
	GeneratedAtUTC string              `json:"generated_at_utc"`
	Season         int                 `json:"season"`
	TZ             string              `json:"tz"`
	BaseURL        string              `json:"base_url"`
	Races          []MpArchiveRaceItem `json:"races"`
}
