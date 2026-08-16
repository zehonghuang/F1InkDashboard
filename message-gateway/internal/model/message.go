package model

import "time"

type Message struct {
	BaseModel

	Platform       string `gorm:"size:32;index;not null" json:"platform"`
	ConversationID uint64 `gorm:"index;not null" json:"conversation_id"`
	PlatformUserID uint64 `gorm:"index;not null" json:"platform_user_id"`

	PlatformMsgID string `gorm:"size:128;uniqueIndex" json:"platform_msg_id"`
	MsgType       string `gorm:"size:32;not null" json:"msg_type"`
	Sender        string `gorm:"size:16;index;not null" json:"sender"`

	Content      string `gorm:"type:text" json:"content"`
	MediaURL     string `gorm:"size:1024" json:"media_url"`
	ThumbURL     string `gorm:"size:1024" json:"thumb_url"`
	LinkTitle    string `gorm:"size:512" json:"link_title"`
	LinkURL      string `gorm:"size:1024" json:"link_url"`
	ProductID    string `gorm:"size:128;index" json:"product_id"`
	ProductTitle string `gorm:"size:512" json:"product_title"`
	ProductImage string `gorm:"size:1024" json:"product_image"`
	ProductPrice int64  `json:"product_price"`

	Status     string `gorm:"size:32;index;default:pending" json:"status"`
	FailReason string `gorm:"size:512" json:"fail_reason"`
	RetryCount int    `gorm:"default:0" json:"retry_count"`

	SentAt      *time.Time `json:"sent_at"`
	DeliveredAt *time.Time `json:"delivered_at"`
	ReadAt      *time.Time `json:"read_at"`

	AgentID uint64 `gorm:"index" json:"agent_id"`
	Extra   string `gorm:"type:text" json:"extra"`
}

func (Message) TableName() string {
	return "messages"
}
