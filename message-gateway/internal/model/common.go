package model

import "time"

const (
	PlatformWechatShop = "wechat_shop"
	PlatformXiaohongshu = "xiaohongshu"
)

const (
	MsgStatusPending   = "pending"
	MsgStatusSending   = "sending"
	MsgStatusSent      = "sent"
	MsgStatusDelivered = "delivered"
	MsgStatusFailed    = "failed"
)

const (
	MsgTypeText     = "text"
	MsgTypeImage    = "image"
	MsgTypeLink     = "link"
	MsgTypeMiniCard = "mini_card"
	MsgTypeProduct  = "product"
)

const (
	SenderUser    = "user"
	SenderService = "service"
	SenderSystem  = "system"
)

type BaseModel struct {
	ID        uint64    `gorm:"primaryKey;autoIncrement" json:"id"`
	CreatedAt time.Time `gorm:"index" json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
