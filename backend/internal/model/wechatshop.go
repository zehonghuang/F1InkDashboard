package model

type WechatShopCategory struct {
	CatID    int64  `json:"cat_id"`
	Name     string `json:"name"`
	FID      int64  `json:"f_id"`
	Level    int    `json:"level"`
	CatType  int    `json:"cat_type"`
	Icon     string `json:"icon_url"`
	Sort     int    `json:"sort"`
	Children []WechatShopCategory `json:"children,omitempty"`
}

type WechatShopCategoriesResponse struct {
	Ok         bool               `json:"ok"`
	Categories []WechatShopCategory `json:"categories"`
}

type WechatShopCategoryProductIDsResponse struct {
	Ok         bool     `json:"ok"`
	CatID      int64    `json:"cat_id"`
	ProductIDs []string `json:"product_ids"`
}

type WechatShopProductSkuAttr struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

type WechatShopProductSku struct {
	SkuID       string                     `json:"sku_id"`
	OutSkuID    string                     `json:"out_sku_id"`
	ThumbImg    string                     `json:"thumb_img"`
	SalePrice   int64                      `json:"sale_price"`
	MarketPrice int64                      `json:"market_price"`
	StockNum    int                        `json:"stock_num"`
	SkuCode     string                     `json:"sku_code"`
	SkuAttrs    []WechatShopProductSkuAttr `json:"sku_attrs,omitempty"`
}

type WechatShopProductDesc struct {
	Imgs []string `json:"imgs,omitempty"`
}

type WechatShopProductDetail struct {
	SpuID        string                  `json:"spu_id"`
	OutProductID string                  `json:"out_product_id"`
	Title        string                  `json:"title"`
	SubTitle     string                  `json:"sub_title"`
	HeadImg      []string                `json:"head_img"`
	DescInfo     WechatShopProductDesc   `json:"desc_info"`
	CateID       int64                   `json:"cate_id"`
	BrandID      int64                   `json:"brand_id"`
	SalePrice    int64                   `json:"min_price"`
	MarketPrice  int64                   `json:"market_price"`
	TotalStock   int                     `json:"total_stock"`
	Status       int                     `json:"status"`
	Skus         []WechatShopProductSku  `json:"skus,omitempty"`
}

type WechatShopProductDetailResponse struct {
	Ok      bool                    `json:"ok"`
	Product *WechatShopProductDetail `json:"product"`
}
