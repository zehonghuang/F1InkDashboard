package model

type MpRaceSessionItem struct {
	Key              string `json:"key"`
	NameCN           string `json:"name_cn"`
	NameEN           string `json:"name_en"`
	StartUTC         string `json:"start_utc"`
	StartLocal       string `json:"start_local"`
	Status           string `json:"status"`
	Disabled         bool   `json:"disabled"`
	OpenF1SessionKey *int   `json:"openf1_session_key,omitempty"`
}

type MpRaceSessionsResponse struct {
	Ok             bool                `json:"ok"`
	GeneratedAtUTC string              `json:"generated_at_utc"`
	Season         int                 `json:"season"`
	Round          int                 `json:"round"`
	RaceName       string              `json:"race_name"`
	TZ             string              `json:"tz"`
	Sessions       []MpRaceSessionItem `json:"sessions"`
}
