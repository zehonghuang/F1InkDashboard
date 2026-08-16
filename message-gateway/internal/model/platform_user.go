package model

import "time"

type PlatformUser struct {
	BaseModel

	Platform    string `gorm:"size:32;index:idx_platform_openid,unique;not null" json:"platform"`
	PlatformUID string `gorm:"size:128;column:platform_uid;index:idx_platform_openid,unique;not null" json:"platform_uid"`
	OpenID      string `gorm:"size:128;index" json:"open_id"`
	UnionID     string `gorm:"size:128;index" json:"union_id"`
	Nickname    string `gorm:"size:255" json:"nickname"`
	Avatar      string `gorm:"size:512" json:"avatar"`
	Phone       string `gorm:"size:32;index" json:"phone"`

	ShopID   string `gorm:"size:64;index" json:"shop_id"`
	ShopName string `gorm:"size:255" json:"shop_name"`

	LastActiveAt *time.Time `gorm:"index" json:"last_active_at"`
	Remark       string     `gorm:"size:512" json:"remark"`
	Extra        string     `gorm:"type:text" json:"extra"`
}

func (PlatformUser) TableName() string {
	return "platform_users"
}
