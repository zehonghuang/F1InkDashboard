package handlers

import (
	"encoding/json"
	"net/http"
	"sort"
	"strings"
	"time"

	"toinc_f1_backend/internal/config"
	"toinc_f1_backend/internal/model"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// @Summary 小程序资讯入库（Upsert）
// @Description OpenClaw/爬虫写入 mp_news_articles 与 mp_news_article_tags。
// @Tags MpNewsAdmin
// @Accept json
// @Produce json
// @Security TokenQuery
// @Param token query string false "鉴权 token（当 NEWS_INGEST_TOKEN 非空时必填）"
// @Param body body model.MpNewsIngestRequestSwagger true "文章对象（published_at 为 RFC3339/RFC3339Nano，示例：2026-05-25T18:30:00+08:00 或 2026-05-25T10:30:00Z；content.nodes 为小程序 rich-text nodes 结构：元素节点 {name,attrs,children}，文本节点 {type:\"text\",text}；children 推荐为数组，但也兼容直接传字符串（会被当成单个 text 节点）；常见 img 节点 {name:\"img\",attrs:{src,mode,style}}）"
// @Success 200 {object} model.MpNewsIngestResponse
// @Failure 400 {object} model.ErrorResponse
// @Failure 401 {object} model.ErrorResponse
// @Failure 500 {object} model.ErrorResponse
// @Failure 503 {object} model.ErrorResponse
// @Router /api/v1/mp/news/ingest [post]
func MpNewsIngest(cfg config.Config, db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !checkToken(c, cfg.NewsIngestToken) {
			return
		}
		if db == nil {
			LogReqError(c, "mp_news_ingest", "mysql_required", nil)
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "mysql_required"})
			return
		}

		var req model.MpNewsIngestRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			LogReqError(c, "mp_news_ingest", "bad_json", err)
			c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: "bad_json"})
			return
		}
		it := req.MpNewsItem

		it.ID = strings.TrimSpace(it.ID)
		if it.ID == "" || !mpNewsSafeID(it.ID) {
			LogReqError(c, "mp_news_ingest", "bad_id", nil)
			c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: "bad_id"})
			return
		}

		if strings.TrimSpace(string(it.LayoutCode)) == "" {
			LogReqError(c, "mp_news_ingest", "missing_layout_code", nil)
			c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: "missing_layout_code"})
			return
		}
		if strings.TrimSpace(string(it.TypeCode)) == "" {
			LogReqError(c, "mp_news_ingest", "missing_type_code", nil)
			c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: "missing_type_code"})
			return
		}
		if strings.TrimSpace(it.Title) == "" {
			LogReqError(c, "mp_news_ingest", "missing_title", nil)
			c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: "missing_title"})
			return
		}

		publishedAtStr := strings.TrimSpace(it.PublishedAt)
		if publishedAtStr == "" {
			LogReqError(c, "mp_news_ingest", "missing_published_at", nil)
			c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: "missing_published_at"})
			return
		}
		ts := strings.ReplaceAll(publishedAtStr, "Z", "+00:00")
		publishedAt, err := time.Parse(time.RFC3339Nano, ts)
		if err != nil {
			publishedAt, err = time.Parse(time.RFC3339, ts)
		}
		if err != nil {
			LogReqError(c, "mp_news_ingest", "bad_published_at", err)
			c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: "bad_published_at"})
			return
		}
		publishedAt = publishedAt.UTC()

		heroDisplayCode := strings.TrimSpace(string(it.HeroDisplayCode))
		if heroDisplayCode == "" {
			heroDisplayCode = ""
		}

		tagText := strings.TrimSpace(it.TagText)
		title := strings.TrimSpace(it.Title)
		summary := strings.TrimSpace(it.Summary)
		coverURL := strings.TrimSpace(it.CoverURL)

		sourceName := ""
		sourceURL := ""
		if it.Source != nil {
			sourceName = strings.TrimSpace(it.Source.Name)
			sourceURL = strings.TrimSpace(it.Source.URL)
		}

		contentFormatCode := "PLAIN"
		contentText := ""
		var contentNodes any = nil
		if it.Content != nil {
			if s := strings.TrimSpace(it.Content.FormatCode); s != "" {
				contentFormatCode = s
			}
			contentText = strings.TrimSpace(it.Content.Text)
			if len(it.Content.Nodes) > 0 {
				contentNodes = it.Content.Nodes
			}
		}
		var contentNodesJSON []byte
		if contentNodes != nil {
			if b, err := json.Marshal(contentNodes); err == nil {
				contentNodesJSON = b
			} else {
				LogReqError(c, "mp_news_ingest", "bad_content_nodes", err)
			}
		}

		tags := make([]string, 0, len(it.Tags))
		seen := map[string]struct{}{}
		for _, t := range it.Tags {
			s := strings.ToLower(strings.TrimSpace(t))
			if s == "" {
				continue
			}
			if _, ok := seen[s]; ok {
				continue
			}
			seen[s] = struct{}{}
			tags = append(tags, s)
		}
		sort.Strings(tags)

		now := time.Now().UTC()
		tx := db.Begin()
		if tx.Error != nil {
			LogReqError(c, "mp_news_ingest", "db_begin_failed", tx.Error)
			c.JSON(500, model.ErrorResponse{Ok: false, Error: "db_failed"})
			return
		}
		defer func() {
			if r := recover(); r != nil {
				if err := tx.Rollback().Error; err != nil {
					LogReqError(c, "mp_news_ingest", "db_rollback_failed", err)
				}
				LogReqError(c, "mp_news_ingest", "panic", nil)
				c.JSON(500, model.ErrorResponse{Ok: false, Error: "db_failed"})
			}
		}()

		res := tx.Exec(`
			INSERT INTO mp_news_articles
				(id, layout_code, hero_display_code, type_code, pinned, weight, tag_text, title, summary, cover_url,
				 published_at, source_name, source_url, content_format_code, content_text, content_nodes, created_at, updated_at)
			VALUES
				(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON DUPLICATE KEY UPDATE
				layout_code=VALUES(layout_code),
				hero_display_code=VALUES(hero_display_code),
				type_code=VALUES(type_code),
				pinned=VALUES(pinned),
				weight=VALUES(weight),
				tag_text=VALUES(tag_text),
				title=VALUES(title),
				summary=VALUES(summary),
				cover_url=VALUES(cover_url),
				published_at=VALUES(published_at),
				source_name=VALUES(source_name),
				source_url=VALUES(source_url),
				content_format_code=VALUES(content_format_code),
				content_text=VALUES(content_text),
				content_nodes=VALUES(content_nodes),
				updated_at=VALUES(updated_at)
		`,
			it.ID,
			string(it.LayoutCode),
			heroDisplayCode,
			string(it.TypeCode),
			it.Pinned,
			it.Weight,
			tagText,
			title,
			summary,
			coverURL,
			publishedAt,
			sourceName,
			sourceURL,
			contentFormatCode,
			contentText,
			func() any {
				if contentNodesJSON == nil {
					return nil
				}
				return contentNodesJSON
			}(),
			now,
			now,
		)
		if res.Error != nil {
			if err := tx.Rollback().Error; err != nil {
				LogReqError(c, "mp_news_ingest", "db_rollback_failed", err)
			}
			LogReqError(c, "mp_news_ingest", "db_exec_failed", res.Error)
			c.JSON(500, model.ErrorResponse{Ok: false, Error: "db_failed"})
			return
		}

		if err := tx.Exec(`DELETE FROM mp_news_article_tags WHERE article_id = ?`, it.ID).Error; err != nil {
			if err2 := tx.Rollback().Error; err2 != nil {
				LogReqError(c, "mp_news_ingest", "db_rollback_failed", err2)
			}
			LogReqError(c, "mp_news_ingest", "db_exec_failed", err)
			c.JSON(500, model.ErrorResponse{Ok: false, Error: "db_failed"})
			return
		}
		for _, t := range tags {
			if err := tx.Exec(
				`INSERT INTO mp_news_article_tags (article_id, tag, created_at) VALUES (?, ?, ?)`,
				it.ID, t, now,
			).Error; err != nil {
				if err2 := tx.Rollback().Error; err2 != nil {
					LogReqError(c, "mp_news_ingest", "db_rollback_failed", err2)
				}
				LogReqError(c, "mp_news_ingest", "db_exec_failed", err)
				c.JSON(500, model.ErrorResponse{Ok: false, Error: "db_failed"})
				return
			}
		}

		if err := tx.Commit().Error; err != nil {
			LogReqError(c, "mp_news_ingest", "db_commit_failed", err)
			c.JSON(500, model.ErrorResponse{Ok: false, Error: "db_failed"})
			return
		}

		c.JSON(200, model.MpNewsIngestResponse{Ok: true, ID: it.ID})
	}
}
