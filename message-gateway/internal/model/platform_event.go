package model

import "time"

type PlatformEvent struct {
	BaseModel

	Platform  string `gorm:"size:32;index;not null" json:"platform"`
	EventType string `gorm:"size:64;index;not null" json:"event_type"`
	EventID   string `gorm:"size:128;uniqueIndex" json:"event_id"`

	ShopID         string `gorm:"size:64;index" json:"shop_id"`
	OrderID        string `gorm:"size:128;index" json:"order_id"`
	PlatformUID    string `gorm:"size:128;column:platform_uid;index" json:"platform_uid"`
	ConversationID string `gorm:"size:128;index" json:"conversation_id"`

	RawPayload  string     `gorm:"type:text" json:"raw_payload"`
	Processed   bool       `gorm:"default:false;index" json:"processed"`
	ProcessedAt *time.Time `json:"processed_at"`
	ErrorMsg    string     `gorm:"size:1024" json:"error_msg"`
}

func (PlatformEvent) TableName() string {
	return "platform_events"
}
