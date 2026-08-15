package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"toinc_f1_backend/internal/config"
	"toinc_f1_backend/internal/model"
	"toinc_f1_backend/internal/wechatshop"

	"github.com/gin-gonic/gin"
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
		ids, err := client.ListProductIDsByCategory(c.Request.Context(), catID)
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
