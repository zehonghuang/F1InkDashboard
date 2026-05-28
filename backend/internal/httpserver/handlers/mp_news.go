package handlers

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type mpNewsSource struct {
	Name string `json:"name"`
	URL  string `json:"url,omitempty"`
}

type mpNewsContent struct {
	FormatCode string `json:"format_code"`
	Text       string `json:"text,omitempty"`
	Nodes      []any  `json:"nodes,omitempty"`
}

type mpNewsItem struct {
	ID              string                `json:"id"`
	LayoutCode      MpNewsLayoutCode      `json:"layout_code"`
	HeroDisplayCode MpNewsHeroDisplayCode `json:"hero_display_code,omitempty"`
	TypeCode        MpNewsTypeCode        `json:"type_code"`
	Pinned          bool                  `json:"pinned"`
	Weight          int                   `json:"weight"`
	TagText         string                `json:"tag_text"`
	Tags            []string              `json:"tags,omitempty"`
	Title           string                `json:"title"`
	Summary         string                `json:"summary"`
	CoverURL        string                `json:"cover_url"`
	PublishedAt     string                `json:"published_at"`
	TimeText        string                `json:"time_text"`
	Source          *mpNewsSource         `json:"source,omitempty"`
	Content         *mpNewsContent        `json:"content,omitempty"`
}

func MpNewsList(staticDir string) gin.HandlerFunc {
	return func(c *gin.Context) {
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
		items, err := mpNewsLoadIndex(staticDir, now)
		if err != nil {
			c.JSON(500, gin.H{"ok": false, "error": "news_unavailable"})
			return
		}

		total := len(items)
		start := (page - 1) * pageSize
		if start > total {
			start = total
		}
		end := start + pageSize
		if end > total {
			end = total
		}

		out := make([]mpNewsItem, 0, end-start)
		for _, it := range items[start:end] {
			cp := it
			cp.Source = nil
			cp.Content = nil
			out = append(out, cp)
		}

		c.JSON(200, gin.H{
			"ok":               true,
			"generated_at_utc": time.Now().UTC().Format(time.RFC3339Nano),
			"tz":               tzName,
			"base_url":         baseURL,
			"page":             page,
			"page_size":        pageSize,
			"total":            total,
			"items":            out,
		})
	}
}

func MpNewsDetail(staticDir string) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := strings.TrimSpace(c.Param("id"))
		if id == "" {
			c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "missing_id"})
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
		it, err := mpNewsLoadItem(staticDir, id, now)
		if err != nil {
			if err == errMpNewsNotFound {
				c.JSON(http.StatusNotFound, gin.H{"ok": false, "error": "news_not_found"})
				return
			}
			c.JSON(500, gin.H{"ok": false, "error": "news_unavailable"})
			return
		}
		c.JSON(200, gin.H{
			"ok":               true,
			"generated_at_utc": time.Now().UTC().Format(time.RFC3339Nano),
			"tz":               tzName,
			"base_url":         baseURL,
			"item":             it,
		})
	}
}

func mpNewsLess(a, b mpNewsItem) bool {
	if a.Pinned != b.Pinned {
		return a.Pinned
	}
	if a.Weight != b.Weight {
		return a.Weight > b.Weight
	}
	at, _ := time.Parse(time.RFC3339, a.PublishedAt)
	bt, _ := time.Parse(time.RFC3339, b.PublishedAt)
	return at.After(bt)
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
