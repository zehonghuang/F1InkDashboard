package model

type MpNewsSource struct {
	Name string `json:"name"`
	URL  string `json:"url,omitempty"`
}

type MpNewsContent struct {
	FormatCode string `json:"format_code"`
	Text       string `json:"text,omitempty"`
	Nodes      []any  `json:"nodes,omitempty"`
}

type MpNewsItem struct {
	ID              string                `json:"id"`
	LayoutCode      MpNewsLayoutCode      `json:"layout_code"`
	HeroDisplayCode MpNewsHeroDisplayCode `json:"hero_display_code,omitempty"`
	TypeCode        MpNewsTypeCode        `json:"type_code"`
	Pinned          bool                  `json:"pinned"`
	Weight          int                   `json:"weight"`
	TagText         string                `json:"tag_text"`
	Tags            []string              `json:"tags,omitempty"`
	Title           string                `json:"title"`
	Summary         string                `json:"summary"`
	CoverURL        string                `json:"cover_url"`
	PublishedAt     string                `json:"published_at"`
	TimeText        string                `json:"time_text"`
	Source          *MpNewsSource         `json:"source,omitempty"`
	Content         *MpNewsContent        `json:"content,omitempty"`
}

type MpNewsListResponse struct {
	Ok             bool         `json:"ok"`
	GeneratedAtUTC string       `json:"generated_at_utc"`
	Tz             string       `json:"tz"`
	BaseURL        string       `json:"base_url"`
	Page           int          `json:"page"`
	PageSize       int          `json:"page_size"`
	Total          int          `json:"total"`
	Items          []MpNewsItem `json:"items"`
}

type MpNewsDetailResponse struct {
	Ok             bool       `json:"ok"`
	GeneratedAtUTC string     `json:"generated_at_utc"`
	Tz             string     `json:"tz"`
	BaseURL        string     `json:"base_url"`
	Item           MpNewsItem `json:"item"`
}
