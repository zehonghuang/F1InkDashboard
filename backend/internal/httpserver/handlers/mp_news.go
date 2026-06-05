package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"toinc_f1_backend/internal/model"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// @Summary 小程序新闻列表
// @Description 分页返回新闻条目列表（不包含 content）。
// @Tags MiniProgram
// @Produce json
// @Param tz query string false "IANA 时区名称" default(Asia/Shanghai)
// @Param page query int false "页码，从 1 开始" default(1)
// @Param page_size query int false "每页数量（最大 50）" default(20)
// @Param ids query string false "按文章 id 列表筛选（逗号分隔）"
// @Param pinned query bool false "按 pinned 筛选（true/false 或 1/0）"
// @Param type_code query string false "按 type_code 列表筛选（逗号分隔）"
// @Param layout_code query string false "按 layout_code 列表筛选（逗号分隔）"
// @Param tag query string false "按 tag 精确匹配（tags 表）或在 tag_text/title/summary 中包含匹配"
// @Param q query string false "按 tag_text/title/summary 包含匹配"
// @Param since query string false "仅返回 published_at > since（RFC3339/RFC3339Nano）"
// @Param sort query string false "排序：default/published_at_desc/published_at_asc" default(default)
// @Success 200 {object} model.MpNewsListResponse
// @Failure 400 {object} model.ErrorResponse
// @Failure 500 {object} model.ErrorResponse
// @Failure 503 {object} model.ErrorResponse
// @Router /api/v1/mp/news [get]
func MpNewsList(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		if db == nil {
			LogReqError(c, "mp_news_list", "mysql_required", nil)
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "mysql_required"})
			return
		}

		tzName := strings.TrimSpace(c.Query("tz"))
		if tzName == "" {
			tzName = "Asia/Shanghai"
		}
		loc, err := time.LoadLocation(tzName)
		if err != nil {
			loc = time.FixedZone("CST", 8*3600)
			tzName = "Asia/Shanghai"
		}

		page := toIntQuery(c, "page", 1)
		if page < 1 {
			page = 1
		}
		pageSize := toIntQuery(c, "page_size", 20)
		if pageSize < 1 {
			pageSize = 1
		}
		if pageSize > 50 {
			pageSize = 50
		}

		baseURL := inferBaseURL(c)
		now := time.Now().In(loc)

		idsQuery := strings.TrimSpace(c.Query("ids"))
		tagQuery := strings.TrimSpace(c.Query("tag"))
		qQuery := strings.TrimSpace(c.Query("q"))
		typeCodesQuery := strings.TrimSpace(c.Query("type_code"))
		layoutCodesQuery := strings.TrimSpace(c.Query("layout_code"))
		sortQuery := strings.ToLower(strings.TrimSpace(c.Query("sort")))
		sinceQuery := strings.TrimSpace(c.Query("since"))

		hasPinned := strings.TrimSpace(c.Query("pinned")) != ""
		pinnedVal := parseBoolQuery(c, "pinned", false)

		ids := make([]string, 0, 16)
		if idsQuery != "" {
			for _, s := range strings.Split(idsQuery, ",") {
				k := strings.TrimSpace(s)
				if k == "" {
					continue
				}
				ids = append(ids, k)
			}
		}

		typeCodes := make([]string, 0, 8)
		if typeCodesQuery != "" {
			for _, s := range strings.Split(typeCodesQuery, ",") {
				k := strings.TrimSpace(strings.ToUpper(s))
				if k == "" {
					continue
				}
				typeCodes = append(typeCodes, k)
			}
		}

		layoutCodes := make([]string, 0, 8)
		if layoutCodesQuery != "" {
			for _, s := range strings.Split(layoutCodesQuery, ",") {
				k := strings.TrimSpace(strings.ToUpper(s))
				if k == "" {
					continue
				}
				layoutCodes = append(layoutCodes, k)
			}
		}

		var sinceTime time.Time
		var hasSince bool
		if sinceQuery != "" {
			ts := strings.ReplaceAll(sinceQuery, "Z", "+00:00")
			if t, err := time.Parse(time.RFC3339Nano, ts); err == nil {
				sinceTime = t
				hasSince = true
			} else if t, err := time.Parse(time.RFC3339, ts); err == nil {
				sinceTime = t
				hasSince = true
			} else {
				c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: "bad_since"})
				return
			}
		}

		whereParts := make([]string, 0, 12)
		whereArgs := make([]any, 0, 12)
		whereParts = append(whereParts, "1=1")

		if len(ids) > 0 {
			whereParts = append(whereParts, "a.id IN (?)")
			whereArgs = append(whereArgs, ids)
		}
		if hasPinned {
			whereParts = append(whereParts, "a.pinned = ?")
			whereArgs = append(whereArgs, pinnedVal)
		}
		if len(typeCodes) > 0 {
			whereParts = append(whereParts, "a.type_code IN (?)")
			whereArgs = append(whereArgs, typeCodes)
		}
		if len(layoutCodes) > 0 {
			whereParts = append(whereParts, "a.layout_code IN (?)")
			whereArgs = append(whereArgs, layoutCodes)
		}
		if hasSince {
			whereParts = append(whereParts, "a.published_at > ?")
			whereArgs = append(whereArgs, sinceTime.UTC())
		}
		if qQuery != "" {
			qv := "%" + strings.ToLower(qQuery) + "%"
			whereParts = append(whereParts, "(LOWER(a.tag_text) LIKE ? OR LOWER(a.title) LIKE ? OR LOWER(a.summary) LIKE ?)")
			whereArgs = append(whereArgs, qv, qv, qv)
		}
		if tagQuery != "" {
			tag := strings.ToLower(strings.TrimSpace(tagQuery))
			tagLike := "%" + tag + "%"
			whereParts = append(whereParts, "(LOWER(a.tag_text) LIKE ? OR LOWER(a.title) LIKE ? OR LOWER(a.summary) LIKE ? OR EXISTS (SELECT 1 FROM mp_news_article_tags t WHERE t.article_id = a.id AND t.tag = ?))")
			whereArgs = append(whereArgs, tagLike, tagLike, tagLike, tag)
		}

		whereSQL := strings.Join(whereParts, " AND ")

		type countRow struct {
			Total int `gorm:"column:total"`
		}
		var cr countRow
		if err := db.Raw("SELECT COUNT(*) AS total FROM mp_news_articles a WHERE "+whereSQL, whereArgs...).Scan(&cr).Error; err != nil {
			LogReqError(c, "mp_news_list", "db_count_failed", err)
			c.JSON(500, model.ErrorResponse{Ok: false, Error: "news_unavailable"})
			return
		}
		total := cr.Total

		orderSQL := "a.pinned DESC, a.published_at DESC, a.created_at DESC, a.weight DESC"
		switch sortQuery {
		case "", "default":
		case "published_at_desc":
			orderSQL = "a.published_at DESC, a.created_at DESC, a.weight DESC"
		case "published_at_asc":
			orderSQL = "a.published_at ASC, a.created_at DESC, a.weight DESC"
		default:
			c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: "bad_sort"})
			return
		}

		start := (page - 1) * pageSize
		if start > total {
			start = total
		}

		type row struct {
			ID              string     `gorm:"column:id"`
			LayoutCode      string     `gorm:"column:layout_code"`
			HeroDisplayCode *string    `gorm:"column:hero_display_code"`
			TypeCode        string     `gorm:"column:type_code"`
			Pinned          bool       `gorm:"column:pinned"`
			Weight          int        `gorm:"column:weight"`
			TagText         string     `gorm:"column:tag_text"`
			Title           string     `gorm:"column:title"`
			Summary         string     `gorm:"column:summary"`
			CoverURL        string     `gorm:"column:cover_url"`
			PublishedAt     time.Time  `gorm:"column:published_at"`
			SourceName      string     `gorm:"column:source_name"`
			SourceURL       string     `gorm:"column:source_url"`
			UpdatedAt       *time.Time `gorm:"column:updated_at"`
		}

		var rows []row
		args := append([]any{}, whereArgs...)
		args = append(args, pageSize, start)
		if err := db.Raw(
			`SELECT a.id, a.layout_code, a.hero_display_code, a.type_code, a.pinned, a.weight, a.tag_text,
			        a.title, a.summary, a.cover_url, a.published_at, a.source_name, a.source_url, a.updated_at
			 FROM mp_news_articles a
			 WHERE `+whereSQL+`
			 ORDER BY `+orderSQL+`
			 LIMIT ? OFFSET ?`,
			args...,
		).Scan(&rows).Error; err != nil {
			LogReqError(c, "mp_news_list", "db_list_failed", err)
			c.JSON(500, model.ErrorResponse{Ok: false, Error: "news_unavailable"})
			return
		}

		idsForTags := make([]string, 0, len(rows))
		for _, r := range rows {
			if r.ID != "" {
				idsForTags = append(idsForTags, r.ID)
			}
		}

		tagsByID := map[string][]string{}
		if len(idsForTags) > 0 {
			type tagRow struct {
				ArticleID string `gorm:"column:article_id"`
				Tag       string `gorm:"column:tag"`
			}
			var trows []tagRow
			if err := db.Raw(
				"SELECT article_id, tag FROM mp_news_article_tags WHERE article_id IN (?) ORDER BY article_id, tag",
				idsForTags,
			).Scan(&trows).Error; err != nil {
				LogReqError(c, "mp_news_list", "db_tags_failed", err)
				c.JSON(500, model.ErrorResponse{Ok: false, Error: "news_unavailable"})
				return
			}
			for _, tr := range trows {
				tagsByID[tr.ArticleID] = append(tagsByID[tr.ArticleID], tr.Tag)
			}
		}

		out := make([]model.MpNewsItem, 0, len(rows))
		for _, r := range rows {
			publishedAt := r.PublishedAt.In(loc).Format(time.RFC3339)
			it := model.MpNewsItem{
				ID:          r.ID,
				LayoutCode:  model.MpNewsLayoutCode(strings.TrimSpace(r.LayoutCode)),
				TypeCode:    model.MpNewsTypeCode(strings.TrimSpace(r.TypeCode)),
				Pinned:      r.Pinned,
				Weight:      r.Weight,
				TagText:     r.TagText,
				Tags:        tagsByID[r.ID],
				Title:       r.Title,
				Summary:     r.Summary,
				CoverURL:    r.CoverURL,
				PublishedAt: publishedAt,
				TimeText:    mpRelativeTime(publishedAt, now),
			}
			if r.HeroDisplayCode != nil {
				it.HeroDisplayCode = model.MpNewsHeroDisplayCode(strings.TrimSpace(*r.HeroDisplayCode))
			}
			out = append(out, it)
		}

		c.JSON(200, model.MpNewsListResponse{
			Ok:             true,
			GeneratedAtUTC: time.Now().UTC().Format(time.RFC3339Nano),
			Tz:             tzName,
			BaseURL:        baseURL,
			Page:           page,
			PageSize:       pageSize,
			Total:          total,
			Items:          out,
		})
	}
}

// @Summary 小程序新闻详情
// @Description 返回指定 id 的新闻详情（包含 content）。
// @Tags MiniProgram
// @Produce json
// @Param id path string true "新闻 ID"
// @Param tz query string false "IANA 时区名称" default(Asia/Shanghai)
// @Success 200 {object} model.MpNewsDetailResponse
// @Failure 400 {object} model.ErrorResponse
// @Failure 404 {object} model.ErrorResponse
// @Failure 500 {object} model.ErrorResponse
// @Failure 503 {object} model.ErrorResponse
// @Router /api/v1/mp/news/{id} [get]
func MpNewsDetail(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		if db == nil {
			LogReqError(c, "mp_news_detail", "mysql_required", nil)
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "mysql_required"})
			return
		}

		id := strings.TrimSpace(c.Param("id"))
		if id == "" {
			c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: "missing_id"})
			return
		}

		tzName := strings.TrimSpace(c.Query("tz"))
		if tzName == "" {
			tzName = "Asia/Shanghai"
		}
		loc, err := time.LoadLocation(tzName)
		if err != nil {
			loc = time.FixedZone("CST", 8*3600)
			tzName = "Asia/Shanghai"
		}

		baseURL := inferBaseURL(c)
		now := time.Now().In(loc)

		type row struct {
			ID              string          `gorm:"column:id"`
			LayoutCode      string          `gorm:"column:layout_code"`
			HeroDisplayCode *string         `gorm:"column:hero_display_code"`
			TypeCode        string          `gorm:"column:type_code"`
			Pinned          bool            `gorm:"column:pinned"`
			Weight          int             `gorm:"column:weight"`
			TagText         string          `gorm:"column:tag_text"`
			Title           string          `gorm:"column:title"`
			Summary         string          `gorm:"column:summary"`
			CoverURL        string          `gorm:"column:cover_url"`
			PublishedAt     time.Time       `gorm:"column:published_at"`
			SourceName      string          `gorm:"column:source_name"`
			SourceURL       string          `gorm:"column:source_url"`
			ContentFormat   string          `gorm:"column:content_format_code"`
			ContentText     *string         `gorm:"column:content_text"`
			ContentNodes    json.RawMessage `gorm:"column:content_nodes"`
		}

		var rows []row
		if err := db.Raw(
			`SELECT id, layout_code, hero_display_code, type_code, pinned, weight, tag_text,
			        title, summary, cover_url, published_at, source_name, source_url,
			        content_format_code, content_text, content_nodes
			 FROM mp_news_articles
			 WHERE id = ?
			 LIMIT 1`,
			id,
		).Scan(&rows).Error; err != nil {
			LogReqError(c, "mp_news_detail", "db_get_failed", err)
			c.JSON(500, model.ErrorResponse{Ok: false, Error: "news_unavailable"})
			return
		}
		if len(rows) == 0 || strings.TrimSpace(rows[0].ID) == "" {
			c.JSON(http.StatusNotFound, model.ErrorResponse{Ok: false, Error: "news_not_found"})
			return
		}
		r := rows[0]

		type tagRow struct {
			Tag string `gorm:"column:tag"`
		}
		var trows []tagRow
		if err := db.Raw(
			"SELECT tag FROM mp_news_article_tags WHERE article_id = ? ORDER BY tag",
			id,
		).Scan(&trows).Error; err != nil {
			LogReqError(c, "mp_news_detail", "db_tags_failed", err)
			c.JSON(500, model.ErrorResponse{Ok: false, Error: "news_unavailable"})
			return
		}
		tags := make([]string, 0, len(trows))
		for _, tr := range trows {
			if strings.TrimSpace(tr.Tag) == "" {
				continue
			}
			tags = append(tags, tr.Tag)
		}

		publishedAt := r.PublishedAt.In(loc).Format(time.RFC3339)
		it := model.MpNewsItem{
			ID:          r.ID,
			LayoutCode:  model.MpNewsLayoutCode(strings.TrimSpace(r.LayoutCode)),
			TypeCode:    model.MpNewsTypeCode(strings.TrimSpace(r.TypeCode)),
			Pinned:      r.Pinned,
			Weight:      r.Weight,
			TagText:     r.TagText,
			Tags:        tags,
			Title:       r.Title,
			Summary:     r.Summary,
			CoverURL:    r.CoverURL,
			PublishedAt: publishedAt,
			TimeText:    mpRelativeTime(publishedAt, now),
		}
		if r.HeroDisplayCode != nil {
			it.HeroDisplayCode = model.MpNewsHeroDisplayCode(strings.TrimSpace(*r.HeroDisplayCode))
		}
		if strings.TrimSpace(r.SourceName) != "" || strings.TrimSpace(r.SourceURL) != "" {
			it.Source = &model.MpNewsSource{Name: strings.TrimSpace(r.SourceName), URL: strings.TrimSpace(r.SourceURL)}
		}
		contentFormat := strings.TrimSpace(r.ContentFormat)
		if contentFormat == "" {
			contentFormat = "PLAIN"
		}
		var nodes []model.MpNewsRichTextNode
		raw := bytes.TrimSpace([]byte(r.ContentNodes))
		if len(raw) > 0 && !bytes.Equal(raw, []byte("null")) {
			if err := json.Unmarshal(raw, &nodes); err != nil {
				LogReqError(c, "mp_news_detail", "bad_content_nodes", err)
				nodes = nil
			}
		}
		var contentText string
		if r.ContentText != nil {
			contentText = *r.ContentText
		}
		it.Content = &model.MpNewsContent{FormatCode: contentFormat, Text: contentText, Nodes: nodes}

		c.JSON(200, model.MpNewsDetailResponse{
			Ok:             true,
			GeneratedAtUTC: time.Now().UTC().Format(time.RFC3339Nano),
			Tz:             tzName,
			BaseURL:        baseURL,
			Item:           it,
		})
	}
}

func mpRelativeTime(iso string, now time.Time) string {
	t, err := time.Parse(time.RFC3339, strings.TrimSpace(iso))
	if err != nil {
		return ""
	}
	d := now.Sub(t.In(now.Location()))
	if d < 0 {
		d = 0
	}
	if d < time.Minute {
		return "刚刚"
	}
	if d < time.Hour {
		mins := int(d.Minutes())
		if mins < 1 {
			mins = 1
		}
		return fmt.Sprintf("%d 分钟前", mins)
	}
	if d < 24*time.Hour {
		hrs := int(d.Hours())
		if hrs < 1 {
			hrs = 1
		}
		return fmt.Sprintf("%d 小时前", hrs)
	}
	if d < 7*24*time.Hour {
		days := int(d.Hours() / 24)
		if days < 1 {
			days = 1
		}
		return fmt.Sprintf("%d 天前", days)
	}
	return t.In(now.Location()).Format("2006.01.02")
}
