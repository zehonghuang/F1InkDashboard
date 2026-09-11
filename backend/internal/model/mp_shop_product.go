package model

import (
	"time"
)

type MpShopProduct struct {
	ID           int64      `json:"id" gorm:"primaryKey;autoIncrement"`
	AppID        string     `json:"app_id" gorm:"type:varchar(64);not null;default:'';index:idx_appid_product,unique,priority:1"`
	ProductID    string     `json:"product_id" gorm:"type:varchar(128);not null;default:'';index:idx_appid_product,unique,priority:2"`
	SpuID        string     `json:"spu_id" gorm:"type:varchar(128);not null;default:''"`
	Title        string     `json:"title" gorm:"type:varchar(512);not null;default:''"`
	SubTitle     string     `json:"sub_title" gorm:"type:varchar(512);not null;default:''"`
	HeadImg      string     `json:"head_img" gorm:"type:varchar(1024);not null;default:''"`
	MinPrice     int64      `json:"min_price" gorm:"type:bigint;not null;default:0"`
	MarketPrice  int64      `json:"market_price" gorm:"type:bigint;not null;default:0"`
	TotalStock   int        `json:"total_stock" gorm:"type:int;not null;default:0"`
	Status       int        `json:"status" gorm:"type:int;not null;default:0"`
	Weight       int        `json:"weight" gorm:"type:int;not null;default:0;index"`
	SnapshotJSON string     `json:"snapshot_json,omitempty" gorm:"type:json"`
	SelectedAt   *time.Time `json:"selected_at"`
	CreatedAt    time.Time  `json:"created_at" gorm:"autoCreateTime"`
	UpdatedAt    time.Time  `json:"updated_at" gorm:"autoUpdateTime"`
}

func (MpShopProduct) TableName() string {
	return "mp_shop_products"
}

type MpShopProductListResponse struct {
	Ok       bool            `json:"ok"`
	Total    int64           `json:"total"`
	Items    []MpShopProduct `json:"items"`
}

type MpShopProductDetailResponse struct {
	Ok   bool          `json:"ok"`
	Item MpShopProduct `json:"item"`
}

type MpShopProductAddRequest struct {
	AppID     string   `json:"app_id" binding:"max=64"`
	ProductIDs []string `json:"product_ids" binding:"required,min=1,max=500"`
}

type MpShopProductRemoveRequest struct {
	AppID      string   `json:"app_id" binding:"max=64"`
	ProductIDs []string `json:"product_ids" binding:"required,min=1,max=500"`
}

type MpShopProductIDsResponse struct {
	Ok         bool     `json:"ok"`
	AppID      string   `json:"app_id"`
	ProductIDs []string `json:"product_ids"`
}
