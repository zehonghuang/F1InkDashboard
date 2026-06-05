package model

type MpConfigResponse struct {
	Ok             bool   `json:"ok"`
	GeneratedAtUTC string `json:"generated_at_utc"`
	ReviewMode     bool   `json:"review_mode"`
	NewsDataset    string `json:"news_dataset"`
}

