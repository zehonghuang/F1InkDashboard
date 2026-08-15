package wechatshop

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"toinc_f1_backend/internal/config"
)

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
	AccessToken string `json:"access_token"`
	ExpiresIn   int    `json:"expires_in"`
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
	expSec := r.ExpiresIn
	if expSec <= 0 {
		expSec = 7200
	}
	c.accessToken = strings.TrimSpace(r.AccessToken)
	c.tokenExpAt = now.Add(time.Duration(expSec) * time.Second)
	return c.accessToken, nil
}

func (c *Client) doShopAPI(ctx context.Context, method, path string, query url.Values, reqBody any, respOut any) error {
	tok, err := c.GetAccessToken(ctx)
	if err != nil {
		return err
	}
	if query == nil {
		query = url.Values{}
	}
	query.Set("access_token", tok)

	u := "https://api.weixin.qq.com" + path + "?" + query.Encode()

	var bodyBytes []byte
	if reqBody != nil {
		b, err := json.Marshal(reqBody)
		if err != nil {
			return err
		}
		bodyBytes = b
	}

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
	CatID    int64  `json:"cat_id"`
	Name     string `json:"name"`
	FID      int64  `json:"f_id"`
	Level    int    `json:"level"`
	CatType  int    `json:"cat_type"`
	Icon     string `json:"icon_url"`
	Sort     int    `json:"sort"`
	Children []Category `json:"children,omitempty"`
}

type listCategoryResponse struct {
	CategoryList []Category `json:"category_list"`
	apiError
}

func (c *Client) ListCategories(ctx context.Context) ([]Category, error) {
	var out listCategoryResponse
	body := map[string]any{
		"page": 1,
		"page_size": 500,
	}
	if err := c.doShopAPI(ctx, http.MethodPost, "/shop/account/get_category_list", nil, body, &out); err != nil {
		return nil, err
	}
	return out.CategoryList, nil
}

type categoryProductRef struct {
	SpuID        string `json:"spu_id"`
	OutProductID string `json:"out_product_id"`
}

type listCategoryProductsResponse struct {
	ProductList []categoryProductRef `json:"product_list"`
	TotalCount  int                  `json:"total_count"`
	NextKey     string              `json:"next_key"`
	apiError
}

func (c *Client) ListProductIDsByCategory(ctx context.Context, cateID int64) ([]string, error) {
	ids := make([]string, 0, 64)
	var nextKey string
	for {
		body := map[string]any{
			"page_size":  100,
			"cate_id":    cateID,
			"status":     5,
			"need_edit_spu": 0,
		}
		if nextKey != "" {
			body["next_key"] = nextKey
		}
		var out listCategoryProductsResponse
		if err := c.doShopAPI(ctx, http.MethodPost, "/shop/spu/get_list", nil, body, &out); err != nil {
			return nil, err
		}
		for _, p := range out.ProductList {
			id := strings.TrimSpace(p.OutProductID)
			if id == "" {
				id = strings.TrimSpace(p.SpuID)
			}
			if id != "" {
				ids = append(ids, id)
			}
		}
		nextKey = strings.TrimSpace(out.NextKey)
		if nextKey == "" {
			break
		}
	}
	return ids, nil
}

type ProductSku struct {
	SkuID          string         `json:"sku_id"`
	OutSkuID       string         `json:"out_sku_id"`
	ThumbImg       string         `json:"thumb_img"`
	SalePrice      int64          `json:"sale_price"`
	MarketPrice    int64          `json:"market_price"`
	StockNum       int            `json:"stock_num"`
	SkuCode        string         `json:"sku_code"`
	SkuAttrs       []ProductSkuAttr `json:"sku_attrs,omitempty"`
}

type ProductSkuAttr struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

type ProductDetail struct {
	SpuID          string      `json:"spu_id"`
	OutProductID   string      `json:"out_product_id"`
	Title          string      `json:"title"`
	SubTitle       string      `json:"sub_title"`
	HeadImg        []string    `json:"head_img"`
	DescInfo       ProductDesc `json:"desc_info"`
	CateID         int64       `json:"cate_id"`
	BrandID        int64       `json:"brand_id"`
	SalePrice      int64       `json:"min_price"`
	MarketPrice    int64       `json:"market_price"`
	TotalStock     int         `json:"total_stock"`
	Status         int         `json:"status"`
	Skus           []ProductSku `json:"skus,omitempty"`
}

type ProductDesc struct {
	Imgs []string `json:"imgs,omitempty"`
}

type getProductResponse struct {
	Spu ProductDetail `json:"spu"`
	apiError
}

func (c *Client) GetProductDetail(ctx context.Context, productID string) (*ProductDetail, error) {
	productID = strings.TrimSpace(productID)
	if productID == "" {
		return nil, errors.New("missing_product_id")
	}
	body := map[string]any{
		"out_product_id": productID,
	}
	var out getProductResponse
	if err := c.doShopAPI(ctx, http.MethodPost, "/shop/spu/get", nil, body, &out); err != nil {
		return nil, err
	}
	pd := out.Spu
	if strings.TrimSpace(pd.OutProductID) == "" && strings.TrimSpace(pd.SpuID) == "" {
		return nil, errors.New("product_not_found")
	}
	return &pd, nil
}
