package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"toinc_f1_backend/internal/config"
	"toinc_f1_backend/internal/model"
	"toinc_f1_backend/internal/wechatshop"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func shopTokenOK(c *gin.Context, expected string) bool {
	expected = strings.TrimSpace(expected)
	if expected == "" {
		return true
	}
	token := strings.TrimSpace(c.Query("token"))
	if token == "" || token != expected {
		c.JSON(http.StatusUnauthorized, model.ErrorResponse{Ok: false, Error: "unauthorized"})
		return false
	}
	return true
}

func transformCategory(src wechatshop.Category) model.WechatShopCategory {
	out := model.WechatShopCategory{
		CatID:   src.CatID,
		Name:    src.Name,
		FID:     src.FID,
		Level:   src.Level,
		CatType: src.CatType,
		Icon:    src.Icon,
		Sort:    src.Sort,
	}
	if len(src.Children) > 0 {
		kids := make([]model.WechatShopCategory, 0, len(src.Children))
		for _, ch := range src.Children {
			kids = append(kids, transformCategory(ch))
		}
		out.Children = kids
	}
	return out
}

// @Summary 微信小店-商品分类列表
// @Description |
//
//	返回微信小店已开通的商品分类（树形结构）。
//
//	鉴权：query token 与 WECHAT_SHOP_API_TOKEN 配置一致。
//
// @Tags WechatShop
// @Produce json
// @Security TokenQuery
// @Param token query string false "鉴权 token"
// @Success 200 {object} model.WechatShopCategoriesResponse
// @Failure 401 {object} model.ErrorResponse
// @Failure 503 {object} model.ErrorResponse
// @Router /api/v1/shop/categories [get]
func WechatShopCategories(cfg config.Config) gin.HandlerFunc {
	client, initErr := wechatshop.NewClient(cfg.WechatShop)

	return func(c *gin.Context) {
		if initErr != nil {
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "wechatshop_unavailable"})
			return
		}
		if !shopTokenOK(c, cfg.WechatShop.ApiToken) {
			return
		}
		list, err := client.ListCategories(c.Request.Context())
		if err != nil {
			c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: strings.TrimSpace(err.Error())})
			return
		}
		out := make([]model.WechatShopCategory, 0, len(list))
		for _, cat := range list {
			out = append(out, transformCategory(cat))
		}
		c.JSON(http.StatusOK, model.WechatShopCategoriesResponse{Ok: true, Categories: out})
	}
}

// @Summary 微信小店-分类关联商品ID列表
// @Description |
//
//	根据分类ID返回该分类下所有上架商品的 out_product_id 列表（若为空则回退 spu_id）。
//
//	鉴权：query token 与 WECHAT_SHOP_API_TOKEN 配置一致。
//
// @Tags WechatShop
// @Produce json
// @Security TokenQuery
// @Param token query string false "鉴权 token"
// @Param id path int true "商品分类ID cat_id"
// @Success 200 {object} model.WechatShopCategoryProductIDsResponse
// @Failure 400 {object} model.ErrorResponse
// @Failure 401 {object} model.ErrorResponse
// @Failure 503 {object} model.ErrorResponse
// @Router /api/v1/shop/categories/{id}/products [get]
func resolveCatLevel(list []wechatshop.Category, catID int64) (level1, level2 int64) {
	level1 = catID
	level2 = 0
	for _, l1 := range list {
		if l1.CatID == catID {
			return l1.CatID, 0
		}
		for _, l2 := range l1.Children {
			if l2.CatID == catID {
				return l1.CatID, l2.CatID
			}
		}
	}
	return catID, 0
}

func WechatShopCategoryProductIDs(cfg config.Config) gin.HandlerFunc {
	client, initErr := wechatshop.NewClient(cfg.WechatShop)

	return func(c *gin.Context) {
		if initErr != nil {
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "wechatshop_unavailable"})
			return
		}
		if !shopTokenOK(c, cfg.WechatShop.ApiToken) {
			return
		}
		rawID := strings.TrimSpace(c.Param("id"))
		catID, err := strconv.ParseInt(rawID, 10, 64)
		if err != nil || catID <= 0 {
			c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: "invalid_cat_id"})
			return
		}
		level1 := int64(0)
		level2 := int64(0)
		level1Raw := strings.TrimSpace(c.Query("level_1_id"))
		level2Raw := strings.TrimSpace(c.Query("level_2_id"))
		if level1Raw != "" {
			n, e := strconv.ParseInt(level1Raw, 10, 64)
			if e == nil && n > 0 {
				level1 = n
			}
		}
		if level2Raw != "" {
			n, e := strconv.ParseInt(level2Raw, 10, 64)
			if e == nil && n > 0 {
				level2 = n
			}
		}
		if level1 == 0 {
			tree, terr := client.ListCategories(c.Request.Context())
			if terr != nil {
				c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: strings.TrimSpace(terr.Error())})
				return
			}
			level1, level2 = resolveCatLevel(tree, catID)
		}
		ids, err := client.ListProductIDsByCategory(c.Request.Context(), level1, level2)
		if err != nil {
			c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: strings.TrimSpace(err.Error())})
			return
		}
		if ids == nil {
			ids = []string{}
		}
		c.JSON(http.StatusOK, model.WechatShopCategoryProductIDsResponse{
			Ok:         true,
			CatID:      catID,
			ProductIDs: ids,
		})
	}
}

type WechatShopAllProductIDsResponse struct {
	Ok         bool     `json:"ok"`
	Error      string   `json:"error,omitempty"`
	ProductIDs []string `json:"product_ids"`
}

// @Summary 微信小店-全店商品ID列表
// @Description |
//
//	返回全店按状态（默认 5 已上架）分页合并后的 product_id 列表。
//
//	鉴权：query token 与 WECHAT_SHOP_API_TOKEN 配置一致。
//
// @Tags WechatShop
// @Produce json
// @Param token query string false "鉴权 token"
// @Param status query int false "商品状态，默认5已上架"
// @Success 200 {object} WechatShopAllProductIDsResponse
// @Router /api/v1/shop/products [get]
func WechatShopAllProductIDs(cfg config.Config) gin.HandlerFunc {
	client, initErr := wechatshop.NewClient(cfg.WechatShop)

	return func(c *gin.Context) {
		if initErr != nil {
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "wechatshop_unavailable"})
			return
		}
		if !shopTokenOK(c, cfg.WechatShop.ApiToken) {
			return
		}
		status := 5
		if s := strings.TrimSpace(c.Query("status")); s != "" {
			n, e := strconv.Atoi(s)
			if e == nil && n > 0 {
				status = n
			}
		}
		ids, err := client.ListAllProductIDs(c.Request.Context(), status)
		if err != nil {
			c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: strings.TrimSpace(err.Error())})
			return
		}
		if ids == nil {
			ids = []string{}
		}
		c.JSON(http.StatusOK, WechatShopAllProductIDsResponse{Ok: true, ProductIDs: ids})
	}
}

func transformProduct(src *wechatshop.ProductDetail) *model.WechatShopProductDetail {
	if src == nil {
		return nil
	}
	out := &model.WechatShopProductDetail{
		SpuID:        src.SpuID,
		OutProductID: src.OutProductID,
		Title:        src.Title,
		SubTitle:     src.SubTitle,
		HeadImg:      src.HeadImg,
		DescInfo: model.WechatShopProductDesc{
			Imgs: src.DescInfo.Imgs,
		},
		CateID:      src.CateID,
		BrandID:     src.BrandID,
		SalePrice:   src.SalePrice,
		MarketPrice: src.MarketPrice,
		TotalStock:  src.TotalStock,
		Status:      src.Status,
	}
	if len(src.Skus) > 0 {
		skus := make([]model.WechatShopProductSku, 0, len(src.Skus))
		for _, s := range src.Skus {
			ms := model.WechatShopProductSku{
				SkuID:       s.SkuID,
				OutSkuID:    s.OutSkuID,
				ThumbImg:    s.ThumbImg,
				SalePrice:   s.SalePrice,
				MarketPrice: s.MarketPrice,
				StockNum:    s.StockNum,
				SkuCode:     s.SkuCode,
			}
			if len(s.SkuAttrs) > 0 {
				attrs := make([]model.WechatShopProductSkuAttr, 0, len(s.SkuAttrs))
				for _, a := range s.SkuAttrs {
					attrs = append(attrs, model.WechatShopProductSkuAttr{Name: a.Name, Value: a.Value})
				}
				ms.SkuAttrs = attrs
			}
			skus = append(skus, ms)
		}
		out.Skus = skus
	}
	return out
}

// @Summary 微信小店-商品详情
// @Description |
//
//	按商品ID（out_product_id）返回商品详情、含 SKU。
//
//	鉴权：query token 与 WECHAT_SHOP_API_TOKEN 配置一致。
//
// @Tags WechatShop
// @Produce json
// @Security TokenQuery
// @Param token query string false "鉴权 token"
// @Param id path string true "商品ID out_product_id"
// @Success 200 {object} model.WechatShopProductDetailResponse
// @Failure 400 {object} model.ErrorResponse
// @Failure 401 {object} model.ErrorResponse
// @Failure 503 {object} model.ErrorResponse
// @Router /api/v1/shop/products/{id} [get]
func WechatShopProductDetail(cfg config.Config) gin.HandlerFunc {
	client, initErr := wechatshop.NewClient(cfg.WechatShop)

	return func(c *gin.Context) {
		if initErr != nil {
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "wechatshop_unavailable"})
			return
		}
		if !shopTokenOK(c, cfg.WechatShop.ApiToken) {
			return
		}
		productID := strings.TrimSpace(c.Param("id"))
		if productID == "" {
			c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: "missing_product_id"})
			return
		}
		pd, err := client.GetProductDetail(c.Request.Context(), productID)
		if err != nil {
			c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: strings.TrimSpace(err.Error())})
			return
		}
		c.JSON(http.StatusOK, model.WechatShopProductDetailResponse{Ok: true, Product: transformProduct(pd)})
	}
}

func parseShopAppIDOrFallback(cfg config.Config, raw string) string {
	raw = strings.TrimSpace(raw)
	if raw != "" {
		return raw
	}
	cfgRaw := strings.TrimSpace(cfg.WechatShop.AppID)
	if cfgRaw != "" {
		return cfgRaw
	}
	return "default"
}

// @Summary Admin-小程序指定商品列表
// @Tags AdminWechatShop
// @Produce json
// @Param app_id query string false "小程序 AppID，留空使用默认"
// @Success 200 {object} model.MpShopProductListResponse
// @Router /api/v1/admin/shop/selected [get]
func AdminShopSelectedList(cfg config.Config, db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		if db == nil {
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "db_unavailable"})
			return
		}
		appID := parseShopAppIDOrFallback(cfg, c.Query("app_id"))
		var total int64
		var items []model.MpShopProduct
		q := db.Model(&model.MpShopProduct{}).Where("app_id = ?", appID)
		q.Count(&total)
		if err := q.Order("weight DESC, id DESC").Find(&items).Error; err != nil {
			c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: strings.TrimSpace(err.Error())})
			return
		}
		if items == nil {
			items = []model.MpShopProduct{}
		}
		c.JSON(http.StatusOK, model.MpShopProductListResponse{Ok: true, Total: total, Items: items})
	}
}

// @Summary Admin-添加指定商品（批量）
// @Tags AdminWechatShop
// @Accept json
// @Produce json
// @Param body body model.MpShopProductAddRequest true "商品ID列表"
// @Success 200 {object} model.MpShopProductListResponse
// @Router /api/v1/admin/shop/selected [post]
func AdminShopSelectedAdd(cfg config.Config, db *gorm.DB) gin.HandlerFunc {
	client, initErr := wechatshop.NewClient(cfg.WechatShop)
	return func(c *gin.Context) {
		if db == nil {
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "db_unavailable"})
			return
		}
		var req model.MpShopProductAddRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: strings.TrimSpace(err.Error())})
			return
		}
		appID := parseShopAppIDOrFallback(cfg, req.AppID)
		now := time.Now().UTC()

		for _, pid := range req.ProductIDs {
			pid = strings.TrimSpace(pid)
			if pid == "" {
				continue
			}
			var existing model.MpShopProduct
			findErr := db.Where("app_id = ? AND product_id = ?", appID, pid).First(&existing).Error
			if findErr == nil {
				continue
			}
			var pd *wechatshop.ProductDetail
			if initErr == nil {
				pd, _ = client.GetProductDetail(c.Request.Context(), pid)
			}
			item := model.MpShopProduct{
				AppID:      appID,
				ProductID:  pid,
				SelectedAt: &now,
			}
			if pd != nil {
				item.SpuID = pd.SpuID
				item.Title = pd.Title
				item.SubTitle = pd.SubTitle
				if len(pd.HeadImg) > 0 {
					item.HeadImg = pd.HeadImg[0]
				}
				item.MinPrice = pd.SalePrice
				item.MarketPrice = pd.MarketPrice
				item.TotalStock = pd.TotalStock
				item.Status = pd.Status
				if snapshot, jerr := json.Marshal(transformProduct(pd)); jerr == nil {
					item.SnapshotJSON = string(snapshot)
				}
			}
			if err := db.Create(&item).Error; err != nil {
				c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: strings.TrimSpace(err.Error())})
				return
			}
		}

		var total int64
		var items []model.MpShopProduct
		q := db.Model(&model.MpShopProduct{}).Where("app_id = ?", appID)
		q.Count(&total)
		q.Order("weight DESC, id DESC").Find(&items)
		if items == nil {
			items = []model.MpShopProduct{}
		}
		c.JSON(http.StatusOK, model.MpShopProductListResponse{Ok: true, Total: total, Items: items})
	}
}

// @Summary Admin-移除指定商品（批量）
// @Tags AdminWechatShop
// @Accept json
// @Produce json
// @Param body body model.MpShopProductRemoveRequest true "商品ID列表"
// @Success 200 {object} model.MpShopProductListResponse
// @Router /api/v1/admin/shop/selected [delete]
func AdminShopSelectedRemove(cfg config.Config, db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		if db == nil {
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "db_unavailable"})
			return
		}
		var req model.MpShopProductRemoveRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: strings.TrimSpace(err.Error())})
			return
		}
		appID := parseShopAppIDOrFallback(cfg, req.AppID)
		ids := make([]string, 0, len(req.ProductIDs))
		for _, pid := range req.ProductIDs {
			pid = strings.TrimSpace(pid)
			if pid != "" {
				ids = append(ids, pid)
			}
		}
		if len(ids) > 0 {
			db.Where("app_id = ? AND product_id IN ?", appID, ids).Delete(&model.MpShopProduct{})
		}
		var total int64
		var items []model.MpShopProduct
		q := db.Model(&model.MpShopProduct{}).Where("app_id = ?", appID)
		q.Count(&total)
		q.Order("weight DESC, id DESC").Find(&items)
		if items == nil {
			items = []model.MpShopProduct{}
		}
		c.JSON(http.StatusOK, model.MpShopProductListResponse{Ok: true, Total: total, Items: items})
	}
}

// @Summary Admin-更新指定商品权重
// @Tags AdminWechatShop
// @Accept json
// @Produce json
// @Param id path int true "记录ID"
// @Param body body object true "{\"weight\": 100"
// @Success 200 {object} model.MpShopProductDetailResponse
// @Router /api/v1/admin/shop/selected/{id} [put]
func AdminShopSelectedUpdate(cfg config.Config, db *gorm.DB) gin.HandlerFunc {
	type Req struct {
		Weight *int `json:"weight"`
	}
	return func(c *gin.Context) {
		if db == nil {
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "db_unavailable"})
			return
		}
		rawID := strings.TrimSpace(c.Param("id"))
		id, err := strconv.ParseInt(rawID, 10, 64)
		if err != nil || id <= 0 {
			c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: "invalid_id"})
			return
		}
		var req Req
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: strings.TrimSpace(err.Error())})
			return
		}
		var item model.MpShopProduct
		if err := db.Where("id = ?", id).First(&item).Error; err != nil {
			c.JSON(http.StatusNotFound, model.ErrorResponse{Ok: false, Error: "not_found"})
			return
		}
		if req.Weight != nil {
			item.Weight = *req.Weight
			db.Save(&item)
		}
		c.JSON(http.StatusOK, model.MpShopProductDetailResponse{Ok: true, Item: item})
	}
}

// @Summary 小程序-查询已指定商品ID列表
// @Tags WechatShop
// @Produce json
// @Param app_id query string false "小程序 AppID"
// @Param token query string false "鉴权 token"
// @Success 200 {object} model.MpShopProductIDsResponse
// @Router /api/v1/shop/selected [get]
func MpShopSelectedIDs(cfg config.Config, db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !shopTokenOK(c, cfg.WechatShop.ApiToken) {
			return
		}
		if db == nil {
			c.JSON(http.StatusOK, model.MpShopProductIDsResponse{Ok: true, AppID: "", ProductIDs: []string{}})
			return
		}
		appID := parseShopAppIDOrFallback(cfg, c.Query("app_id"))
		var items []model.MpShopProduct
		db.Model(&model.MpShopProduct{}).Where("app_id = ?", appID).
			Order("weight DESC, id DESC").Find(&items)
		ids := make([]string, 0, len(items))
		for _, it := range items {
			ids = append(ids, it.ProductID)
		}
		c.JSON(http.StatusOK, model.MpShopProductIDsResponse{Ok: true, AppID: appID, ProductIDs: ids})
	}
}

// @Summary 小程序-查询已指定商品详情列表（带缓存快照）
// @Tags WechatShop
// @Produce json
// @Param app_id query string false "小程序 AppID"
// @Param token query string false "鉴权 token"
// @Success 200 {object} model.MpShopProductListResponse
// @Router /api/v1/shop/selected/detail [get]
func MpShopSelectedDetailList(cfg config.Config, db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !shopTokenOK(c, cfg.WechatShop.ApiToken) {
			return
		}
		if db == nil {
			c.JSON(http.StatusOK, model.MpShopProductListResponse{Ok: true, Total: 0, Items: []model.MpShopProduct{}})
			return
		}
		appID := parseShopAppIDOrFallback(cfg, c.Query("app_id"))
		var total int64
		var items []model.MpShopProduct
		q := db.Model(&model.MpShopProduct{}).Where("app_id = ?", appID)
		q.Count(&total)
		if err := q.Order("weight DESC, id DESC").Find(&items).Error; err != nil {
			c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: strings.TrimSpace(err.Error())})
			return
		}
		if items == nil {
			items = []model.MpShopProduct{}
		}
		c.JSON(http.StatusOK, model.MpShopProductListResponse{Ok: true, Total: total, Items: items})
	}
}
