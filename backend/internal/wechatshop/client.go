package wechatshop

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"toinc_f1_backend/internal/config"
)

type flexInt64 int64

func (f *flexInt64) UnmarshalJSON(data []byte) error {
	data = bytes.TrimSpace(data)
	if len(data) == 0 || bytes.Equal(data, []byte(`null`)) {
		*f = 0
		return nil
	}
	if data[0] == '"' {
		var s string
		if err := json.Unmarshal(data, &s); err != nil {
			return err
		}
		s = strings.TrimSpace(s)
		if s == "" {
			*f = 0
			return nil
		}
		n, err := strconv.ParseInt(s, 10, 64)
		if err != nil {
			// try float
			fn, ferr := strconv.ParseFloat(s, 64)
			if ferr != nil {
				return err
			}
			*f = flexInt64(int64(fn))
			return nil
		}
		*f = flexInt64(n)
		return nil
	}
	var n int64
	if err := json.Unmarshal(data, &n); err == nil {
		*f = flexInt64(n)
		return nil
	}
	var fn float64
	if err := json.Unmarshal(data, &fn); err != nil {
		return err
	}
	*f = flexInt64(int64(fn))
	return nil
}

type flexInt int

func (f *flexInt) UnmarshalJSON(data []byte) error {
	var v flexInt64
	if err := json.Unmarshal(data, &v); err != nil {
		return err
	}
	*f = flexInt(int(v))
	return nil
}

type Client struct {
	cfg        config.WechatShopConfig
	httpClient *http.Client

	mu          sync.Mutex
	accessToken string
	tokenExpAt  time.Time
}

func NewClient(cfg config.WechatShopConfig) (*Client, error) {
	if !cfg.Enabled {
		return nil, errors.New("wechatshop_disabled")
	}
	if strings.TrimSpace(cfg.AppID) == "" {
		return nil, errors.New("missing_appid")
	}
	if strings.TrimSpace(cfg.Secret) == "" {
		return nil, errors.New("missing_secret")
	}
	return &Client{
		cfg:        cfg,
		httpClient: &http.Client{Timeout: 15 * time.Second},
	}, nil
}

type apiError struct {
	ErrCode int    `json:"errcode"`
	ErrMsg  string `json:"errmsg"`
}

func (e *apiError) Error() string {
	return fmt.Sprintf("wechatshop_api errcode=%d errmsg=%s", e.ErrCode, e.ErrMsg)
}

type tokenResponse struct {
	AccessToken string    `json:"access_token"`
	ExpiresIn   flexInt   `json:"expires_in"`
	apiError
}

func (c *Client) GetAccessToken(ctx context.Context) (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	now := time.Now()
	if c.accessToken != "" && now.Before(c.tokenExpAt.Add(-30*time.Second)) {
		return c.accessToken, nil
	}

	u := "https://api.weixin.qq.com/cgi-bin/token"
	q := url.Values{}
	q.Set("grant_type", "client_credential")
	q.Set("appid", c.cfg.AppID)
	q.Set("secret", c.cfg.Secret)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u+"?"+q.Encode(), nil)
	if err != nil {
		return "", err
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(io.LimitReader(resp.Body, 64*1024))
	if err != nil {
		return "", err
	}
	var r tokenResponse
	if err := json.Unmarshal(raw, &r); err != nil {
		return "", err
	}
	if r.ErrCode != 0 {
		return "", &apiError{ErrCode: r.ErrCode, ErrMsg: r.ErrMsg}
	}
	if strings.TrimSpace(r.AccessToken) == "" {
		return "", errors.New("empty_access_token")
	}
	expSec := int(r.ExpiresIn)
	if expSec <= 0 {
		expSec = 7200
	}
	c.accessToken = strings.TrimSpace(r.AccessToken)
	c.tokenExpAt = now.Add(time.Duration(expSec) * time.Second)
	return c.accessToken, nil
}

func (c *Client) doShopAPI(ctx context.Context, method, path string, reqBody any, respOut any) error {
	tok, err := c.GetAccessToken(ctx)
	if err != nil {
		return err
	}
	u := "https://api.weixin.qq.com" + path
	q := url.Values{}
	q.Set("access_token", tok)
	u += "?" + q.Encode()

	var bodyBytes []byte
	if reqBody != nil {
		b, err := json.Marshal(reqBody)
		if err != nil {
			return err
		}
		bodyBytes = b
	}
	log.Printf("[wechatshop] REQ %s %s body=%s", method, path, strings.TrimSpace(string(bodyBytes)))

	req, err := http.NewRequestWithContext(ctx, method, u, bytes.NewReader(bodyBytes))
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	if bodyBytes != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(io.LimitReader(resp.Body, 4*1024*1024))
	if err != nil {
		return err
	}
	respPreview := strings.TrimSpace(string(raw))
	if len(respPreview) > 4096 {
		respPreview = respPreview[:4096] + "...(truncated)"
	}
	log.Printf("[wechatshop] RES %s %s status=%d body=%s", method, path, resp.StatusCode, respPreview)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("wechatshop_http_%d: %s", resp.StatusCode, strings.TrimSpace(string(raw)))
	}

	var errCheck apiError
	_ = json.Unmarshal(raw, &errCheck)
	if errCheck.ErrCode != 0 {
		return &apiError{ErrCode: errCheck.ErrCode, ErrMsg: errCheck.ErrMsg}
	}
	if respOut == nil {
		return nil
	}
	return json.Unmarshal(raw, respOut)
}

type Category struct {
	CatID    int64      `json:"cat_id"`
	Name     string     `json:"name"`
	FID      int64      `json:"f_id"`
	Level    int        `json:"level"`
	CatType  int        `json:"cat_type"`
	Icon     string     `json:"icon_url"`
	Sort     int        `json:"sort"`
	Children []Category `json:"children,omitempty"`
}

type classLevel2 struct {
	ID     flexInt64 `json:"id"`
	Name   string    `json:"name"`
	ImgURL string    `json:"img_url"`
}

type classLevel1 struct {
	ID     flexInt64      `json:"id"`
	Name   string         `json:"name"`
	ImgURL string         `json:"img_url"`
	Level2 []classLevel2  `json:"level_2"`
}

type classTree struct {
	Level1 []classLevel1 `json:"level_1"`
	Name   string        `json:"name"`
	TreeID int64         `json:"tree_id"`
}

type listCategoryResponse struct {
	Tree    classTree `json:"tree"`
	Trees   []classTree `json:"trees,omitempty"`
	Version int64     `json:"version"`
	apiError
}

func firstTreeWithLevel1(out listCategoryResponse) *classTree {
	if len(out.Tree.Level1) > 0 {
		return &out.Tree
	}
	for i := range out.Trees {
		if len(out.Trees[i].Level1) > 0 {
			return &out.Trees[i]
		}
	}
	if out.Tree.TreeID > 0 || len(out.Trees) > 0 {
		if len(out.Trees) > 0 {
			return &out.Trees[0]
		}
		return &out.Tree
	}
	return nil
}

type categoryDetailInfoSrc struct {
	CatID   flexInt64 `json:"cat_id"`
	Name    string    `json:"name"`
	FID     flexInt64 `json:"fid"`
	Level   flexInt   `json:"level"`
	CatType flexInt   `json:"cat_type"`
	IconURL string    `json:"icon_url"`
}

type categoryDetailResponse struct {
	Info   categoryDetailInfoSrc `json:"info"`
	apiError
}

func flattenClassificationTree(tree classTree) []Category {
	out := make([]Category, 0, 32)
	for _, l1 := range tree.Level1 {
		c1 := Category{
			CatID:   int64(l1.ID),
			Name:    l1.Name,
			FID:     0,
			Level:   1,
			Icon:    l1.ImgURL,
			CatType: 0,
		}
		if len(l1.Level2) > 0 {
			kids := make([]Category, 0, len(l1.Level2))
			for _, l2 := range l1.Level2 {
				kids = append(kids, Category{
					CatID:   int64(l2.ID),
					Name:    l2.Name,
					FID:     int64(l1.ID),
					Level:   2,
					Icon:    l2.ImgURL,
					CatType: 0,
				})
			}
			c1.Children = kids
		}
		out = append(out, c1)
	}
	return out
}

func (c *Client) ListCategories(ctx context.Context) ([]Category, error) {
	var out listCategoryResponse
	body := map[string]any{}
	err := c.doShopAPI(ctx, http.MethodPost, "/channels/ec/store/classification/tree/get", body, &out)
	if err != nil {
		return nil, err
	}
	t := firstTreeWithLevel1(out)
	if t == nil {
		return []Category{}, nil
	}
	return flattenClassificationTree(*t), nil
}

type listCategoryProductsResponse struct {
	ProductIDs  []int64   `json:"product_ids"`
	PageContext string    `json:"page_context"`
	apiError
}

func (c *Client) ListProductIDsByCategory(ctx context.Context, level1ID, level2ID int64) ([]string, error) {
	ids := make([]string, 0, 64)
	var pageContext string
	for {
		body := map[string]any{
			"req": map[string]any{
				"level_1_id":   level1ID,
				"level_2_id":   level2ID,
				"page_context": pageContext,
				"page_size":    100,
			},
		}
		var out listCategoryProductsResponse
		if err := c.doShopAPI(ctx, http.MethodPost, "/channels/ec/store/classification/tree/product/get", body, &out); err != nil {
			return nil, err
		}
		for _, pid := range out.ProductIDs {
			ids = append(ids, fmt.Sprintf("%d", pid))
		}
		next := strings.TrimSpace(out.PageContext)
		if next == "" || next == pageContext {
			break
		}
		pageContext = next
	}
	return ids, nil
}

type ProductSku struct {
	SkuID        string          `json:"sku_id"`
	OutSkuID     string          `json:"out_sku_id"`
	ThumbImg     string          `json:"thumb_img"`
	SalePrice    int64           `json:"sale_price"`
	MarketPrice  int64           `json:"market_price"`
	StockNum     int             `json:"stock_num"`
	SkuCode      string          `json:"sku_code"`
	SkuAttrs     []ProductSkuAttr `json:"sku_attrs,omitempty"`
}

type ProductSkuAttr struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

type ProductDetail struct {
	SpuID          string      `json:"product_id"`
	OutProductID   string      `json:"out_product_id"`
	Title          string      `json:"title"`
	SubTitle       string      `json:"subtitle"`
	HeadImg        []string    `json:"head_imgs"`
	DescInfo       ProductDesc `json:"desc_info"`
	CateID         int64       `json:"cate_id"`
	BrandID        int64       `json:"brand_id"`
	SalePrice      int64       `json:"min_price"`
	MarketPrice    int64       `json:"market_price"`
	TotalStock     int         `json:"total_stock_num"`
	Status         int         `json:"status"`
	Skus           []ProductSku `json:"skus,omitempty"`
}

type ProductDesc struct {
	Imgs []string `json:"imgs,omitempty"`
}

type productSkuAttrSrc struct {
	AttrKey   string `json:"attr_key"`
	AttrValue string `json:"attr_value"`
}

type productSkuSrc struct {
	SkuID       string              `json:"sku_id"`
	OutSkuID    string              `json:"out_sku_id"`
	ThumbImg    string              `json:"thumb_img"`
	SalePrice   flexInt64           `json:"sale_price"`
	MarketPrice flexInt64           `json:"market_price"`
	StockNum    flexInt             `json:"stock_num"`
	SkuCode     string              `json:"sku_code"`
	SkuAttrs    []productSkuAttrSrc `json:"sku_attrs,omitempty"`
}

type productDetailSrc struct {
	ProductID     string          `json:"product_id"`
	OutProductID  string          `json:"out_product_id"`
	Title         string          `json:"title"`
	Subtitle      string          `json:"subtitle"`
	HeadImgs      []string        `json:"head_imgs"`
	DescInfo      ProductDesc     `json:"desc_info"`
	CateID        flexInt64       `json:"cate_id"`
	BrandID       flexInt64       `json:"brand_id"`
	MinPrice      flexInt64       `json:"min_price"`
	MarketPrice   flexInt64       `json:"market_price"`
	TotalStockNum flexInt         `json:"total_stock_num"`
	Status        flexInt         `json:"status"`
	Skus          []productSkuSrc `json:"skus,omitempty"`
}

type getProductResponse struct {
	Product productDetailSrc `json:"product"`
	apiError
}

func convertProduct(src productDetailSrc) *ProductDetail {
	if strings.TrimSpace(src.ProductID) == "" && strings.TrimSpace(src.OutProductID) == "" {
		return nil
	}
	pd := &ProductDetail{
		SpuID:        src.ProductID,
		OutProductID: src.OutProductID,
		Title:        src.Title,
		SubTitle:     src.Subtitle,
		HeadImg:      src.HeadImgs,
		DescInfo:     src.DescInfo,
		CateID:       int64(src.CateID),
		BrandID:      int64(src.BrandID),
		SalePrice:    int64(src.MinPrice),
		MarketPrice:  int64(src.MarketPrice),
		TotalStock:   int(src.TotalStockNum),
		Status:       int(src.Status),
	}
	if len(src.Skus) > 0 {
		skus := make([]ProductSku, 0, len(src.Skus))
		for _, s := range src.Skus {
			ps := ProductSku{
				SkuID:       s.SkuID,
				OutSkuID:    s.OutSkuID,
				ThumbImg:    s.ThumbImg,
				SalePrice:   int64(s.SalePrice),
				MarketPrice: int64(s.MarketPrice),
				StockNum:    int(s.StockNum),
				SkuCode:     s.SkuCode,
			}
			if len(s.SkuAttrs) > 0 {
				attrs := make([]ProductSkuAttr, 0, len(s.SkuAttrs))
				for _, a := range s.SkuAttrs {
					attrs = append(attrs, ProductSkuAttr{Name: a.AttrKey, Value: a.AttrValue})
				}
				ps.SkuAttrs = attrs
			}
			skus = append(skus, ps)
		}
		pd.Skus = skus
	}
	return pd
}

func (c *Client) GetProductDetail(ctx context.Context, productID string) (*ProductDetail, error) {
	productID = strings.TrimSpace(productID)
	if productID == "" {
		return nil, errors.New("missing_product_id")
	}
	body := map[string]any{
		"product_id": productID,
		"data_type":  1,
	}
	var out getProductResponse
	if err := c.doShopAPI(ctx, http.MethodPost, "/channels/ec/product/get", body, &out); err != nil {
		return nil, err
	}
	pd := convertProduct(out.Product)
	if pd == nil {
		return nil, errors.New("product_not_found")
	}
	return pd, nil
}

type listProductsResponse struct {
	ProductIDs  []int64    `json:"product_ids"`
	NextKey     string     `json:"next_key"`
	TotalCount  flexInt    `json:"total_num"`
	apiError
}

func (c *Client) ListAllProductIDs(ctx context.Context, status int) ([]string, error) {
	if status <= 0 {
		status = 5
	}
	ids := make([]string, 0, 64)
	var nextKey string
	for {
		body := map[string]any{
			"status":     status,
			"page_size":  100,
		}
		if nextKey != "" {
			body["next_key"] = nextKey
		}
		var out listProductsResponse
		if err := c.doShopAPI(ctx, http.MethodPost, "/channels/ec/product/list/get", body, &out); err != nil {
			return nil, err
		}
		for _, pid := range out.ProductIDs {
			ids = append(ids, fmt.Sprintf("%d", pid))
		}
		nk := strings.TrimSpace(out.NextKey)
		if nk == "" || nk == nextKey {
			break
		}
		nextKey = nk
	}
	return ids, nil
}
