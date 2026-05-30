package model

type MpNewsIngestRequest struct {
	MpNewsItem
}

type MpNewsIngestResponse struct {
	Ok bool   `json:"ok"`
	ID string `json:"id"`
}

