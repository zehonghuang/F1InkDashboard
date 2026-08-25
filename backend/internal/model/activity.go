package model

import "time"

type ActivityStatus string

const (
	ActivityStatusDraft     ActivityStatus = "draft"
	ActivityStatusPublished ActivityStatus = "published"
	ActivityStatusEnded     ActivityStatus = "ended"
)

type Activity struct {
	ID          int64          `json:"id" gorm:"primaryKey;autoIncrement"`
	Title       string         `json:"title" gorm:"type:varchar(255);not null"`
	Description string         `json:"description" gorm:"type:text"`
	CoverURL    string         `json:"cover_url" gorm:"type:varchar(512)"`
	Status      ActivityStatus `json:"status" gorm:"type:varchar(32);not null;default:draft;index"`
	StartTime   *time.Time     `json:"start_time"`
	EndTime     *time.Time     `json:"end_time"`
	CreatedAt   time.Time      `json:"created_at" gorm:"autoCreateTime"`
	UpdatedAt   time.Time      `json:"updated_at" gorm:"autoUpdateTime"`
}

func (Activity) TableName() string {
	return "activities"
}

type ActivityListResponse struct {
	Ok       bool       `json:"ok"`
	Page     int        `json:"page"`
	PageSize int        `json:"page_size"`
	Total    int64      `json:"total"`
	Items    []Activity `json:"items"`
}

type ActivityDetailResponse struct {
	Ok   bool     `json:"ok"`
	Item Activity `json:"item"`
}

type ActivityCreateRequest struct {
	Title       string         `json:"title" binding:"required,max=255"`
	Description string         `json:"description"`
	CoverURL    string         `json:"cover_url"`
	Status      ActivityStatus `json:"status"`
	StartTime   *time.Time     `json:"start_time"`
	EndTime     *time.Time     `json:"end_time"`
}

type ActivityUpdateRequest struct {
	Title       *string         `json:"title" binding:"omitempty,max=255"`
	Description *string         `json:"description"`
	CoverURL    *string         `json:"cover_url"`
	Status      *ActivityStatus `json:"status"`
	StartTime   **time.Time     `json:"start_time"`
	EndTime     **time.Time     `json:"end_time"`
}
