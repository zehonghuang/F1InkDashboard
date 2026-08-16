package model

import "time"

type Conversation struct {
	BaseModel

	Platform       string `gorm:"size:32;index;not null" json:"platform"`
	PlatformUserID uint64 `gorm:"index;not null" json:"platform_user_id"`
	ConversationID string `gorm:"size:128;uniqueIndex;not null" json:"conversation_id"`

	ShopID    string `gorm:"size:64;index" json:"shop_id"`
	OrderID   string `gorm:"size:128;index" json:"order_id"`
	ProductID string `gorm:"size:128;index" json:"product_id"`

	Status        string     `gorm:"size:32;index;default:active" json:"status"`
	LastMessage   string     `gorm:"type:text" json:"last_message"`
	LastMessageAt *time.Time `gorm:"index" json:"last_message_at"`
	LastSender    string     `gorm:"size:16" json:"last_sender"`
	UnreadCount   int        `gorm:"default:0" json:"unread_count"`

	AssignedAgentID uint64 `gorm:"index" json:"assigned_agent_id"`
	Tags            string `gorm:"size:512" json:"tags"`
	Extra           string `gorm:"type:text" json:"extra"`
}

func (Conversation) TableName() string {
	return "conversations"
}
