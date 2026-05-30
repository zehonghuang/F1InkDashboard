package model

type F1SessionMetaResponse struct {
	Ok             bool   `json:"ok"`
	GeneratedAtUTC string `json:"generated_at_utc"`

	SessionKey int `json:"session_key"`
	Season     int `json:"season"`
	Round      int `json:"round"`

	RaceName       string `json:"race_name"`
	SessionCode    string `json:"session_code"`
	SessionNameCN  string `json:"session_name_cn"`
	SessionNameEN  string `json:"session_name_en"`
	DisplayTitleCN string `json:"display_title_cn"`
}
