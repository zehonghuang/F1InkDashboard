package model

type MpRaceWeekRace struct {
	Season               int    `json:"season"`
	Round                int    `json:"round"`
	RaceName             string `json:"race_name"`
	RaceDateUTC          string `json:"race_date_utc"`
	RaceDateLocal        string `json:"race_date_local"`
	OpenF1RaceSessionKey *int   `json:"openf1_race_session_key,omitempty"`
}

type MpRaceWeekNextSession struct {
	Key              string `json:"key"`
	StartsAtUTC      string `json:"starts_at_utc"`
	StartsAtLocal    string `json:"starts_at_local"`
	In               string `json:"in"`
	Seconds          int    `json:"seconds"`
	OpenF1SessionKey *int   `json:"openf1_session_key,omitempty"`
}

type MpRaceWeekResponse struct {
	Ok             bool                   `json:"ok"`
	GeneratedAtUTC string                 `json:"generated_at_utc"`
	Season         int                    `json:"season"`
	TZ             string                 `json:"tz"`
	WeekStartLocal string                 `json:"week_start_local"`
	WeekEndLocal   string                 `json:"week_end_local"`
	IsRaceWeek     bool                   `json:"is_race_week"`
	Race           *MpRaceWeekRace        `json:"race,omitempty"`
	NextSession    *MpRaceWeekNextSession `json:"next_session,omitempty"`
}
