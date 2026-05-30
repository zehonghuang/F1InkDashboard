package model

type MpPrefsTeamInfo struct {
	TeamKey     string  `json:"team_key"`
	TeamName    *string `json:"team_name"`
	TeamColor   *string `json:"team_color"`
	TeamLogoURL *string `json:"team_logo_url"`
}

type MpPrefsDriverInfo struct {
	DriverNumber  int     `json:"driver_number"`
	FullName      *string `json:"full_name"`
	BroadcastName *string `json:"broadcast_name"`
	NameAcronym   *string `json:"name_acronym"`
	HeadshotURL   *string `json:"headshot_url"`
	TeamName      *string `json:"team_name"`
	TeamColor     *string `json:"team_color"`
}

type MpPrefsV1Prefs struct {
	TeamName      *string             `json:"team_name"`
	TeamKeys      []string            `json:"team_keys"`
	DriverNumbers []int               `json:"driver_numbers"`
	TeamColors    map[string]string   `json:"team_colors"`
	DriverColors  map[string]string   `json:"driver_colors"`
	TeamInfos     []MpPrefsTeamInfo   `json:"team_infos"`
	DriverInfos   []MpPrefsDriverInfo `json:"driver_infos"`
}

type MpPrefsGetResponseV1 struct {
	Ok             bool           `json:"ok"`
	GeneratedAtUTC string         `json:"generated_at_utc"`
	Prefs          MpPrefsV1Prefs `json:"prefs"`
}

type MpPrefsUpdateResponseV1 struct {
	Ok    bool           `json:"ok"`
	Prefs MpPrefsV1Prefs `json:"prefs"`
}

type MpPrefsTeamV2Item struct {
	Color   *string `json:"color"`
	LogoURL *string `json:"logo_url"`
}

type MpPrefsDriverV2Item struct {
	Name        *string `json:"name"`
	ACR         *string `json:"acr"`
	HeadshotURL *string `json:"headshot_url"`
	TeamKey     *string `json:"team_key"`
	Color       *string `json:"color"`
}

type MpPrefsV2Prefs struct {
	TeamKeys      []string                       `json:"team_keys"`
	DriverNumbers []int                          `json:"driver_numbers"`
	Teams         map[string]MpPrefsTeamV2Item   `json:"teams"`
	Drivers       map[string]MpPrefsDriverV2Item `json:"drivers"`
}

type MpPrefsGetResponseV2 struct {
	Ok             bool           `json:"ok"`
	GeneratedAtUTC string         `json:"generated_at_utc"`
	Prefs          MpPrefsV2Prefs `json:"prefs"`
}

type MpPrefsUpdateResponseV2 struct {
	Ok    bool           `json:"ok"`
	Prefs MpPrefsV2Prefs `json:"prefs"`
}
