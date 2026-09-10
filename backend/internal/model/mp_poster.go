package model

import (
	"time"
)

type MpPosterStatus string

const (
	MpPosterStatusDraft     MpPosterStatus = "draft"
	MpPosterStatusPublished MpPosterStatus = "published"
	MpPosterStatusOffline   MpPosterStatus = "offline"
)

type MpPoster struct {
	ID              int64          `json:"id" gorm:"primaryKey;autoIncrement"`
	Title           string         `json:"title" gorm:"type:varchar(255);not null"`
	PosterURL       string         `json:"poster_url" gorm:"type:varchar(512);not null;default:''"`
	PosterWidth     int            `json:"poster_width" gorm:"type:int;not null;default:0"`
	PosterHeight    int            `json:"poster_height" gorm:"type:int;not null;default:0"`
	PosterRatio     float64        `json:"poster_ratio" gorm:"type:double;not null;default:0"`
	Status          MpPosterStatus `json:"status" gorm:"type:varchar(32);not null;default:draft;index"`
	Weight          int            `json:"weight" gorm:"type:int;not null;default:0"`
	ContentFormat   string         `json:"content_format" gorm:"type:varchar(32);not null;default:'RICH_TEXT_NODES'"`
	ContentText     string         `json:"content_text,omitempty" gorm:"type:mediumtext"`
	ContentNodes    string         `json:"content_nodes,omitempty" gorm:"type:json"`
	PublishedAt     *time.Time     `json:"published_at"`
	CreatedAt       time.Time      `json:"created_at" gorm:"autoCreateTime"`
	UpdatedAt       time.Time      `json:"updated_at" gorm:"autoUpdateTime"`
}

func (MpPoster) TableName() string {
	return "mp_posters"
}

type MpPosterListResponse struct {
	Ok       bool       `json:"ok"`
	Page     int        `json:"page"`
	PageSize int        `json:"page_size"`
	Total    int64      `json:"total"`
	Items    []MpPoster `json:"items"`
}

type MpPosterDetailResponse struct {
	Ok   bool     `json:"ok"`
	Item MpPoster `json:"item"`
}

type MpPosterCreateRequest struct {
	Title        string         `json:"title" binding:"required,max=255"`
	PosterURL    string         `json:"poster_url"`
	PosterWidth  int            `json:"poster_width"`
	PosterHeight int            `json:"poster_height"`
	PosterRatio  float64        `json:"poster_ratio"`
	Status       MpPosterStatus `json:"status"`
	Weight       int            `json:"weight"`
	ContentFormat string        `json:"content_format"`
	ContentText  string         `json:"content_text"`
	ContentNodes any            `json:"content_nodes"`
	PublishedAt  *time.Time     `json:"published_at"`
}

type MpPosterUpdateRequest struct {
	Title        *string         `json:"title" binding:"omitempty,max=255"`
	PosterURL    *string         `json:"poster_url"`
	PosterWidth  *int            `json:"poster_width"`
	PosterHeight *int            `json:"poster_height"`
	PosterRatio  *float64        `json:"poster_ratio"`
	Status       *MpPosterStatus `json:"status"`
	Weight       *int            `json:"weight"`
	ContentFormat *string        `json:"content_format"`
	ContentText  *string         `json:"content_text"`
	ContentNodes *any            `json:"content_nodes"`
	PublishedAt  **time.Time     `json:"published_at"`
}

type MpPosterUploadImageResponse struct {
	Ok      bool   `json:"ok"`
	URL     string `json:"url"`
	Mime    string `json:"mime"`
	Bytes   int64  `json:"bytes"`
	Width   int    `json:"width"`
	Height  int    `json:"height"`
}

type MpMpPosterResponse struct {
	Ok       bool      `json:"ok"`
	BaseURL  string    `json:"base_url"`
	Item     *MpPoster `json:"item,omitempty"`
}
