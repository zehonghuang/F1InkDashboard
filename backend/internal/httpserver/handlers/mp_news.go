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
	Text       string `json:"text"`
}

type mpNewsItem struct {
	ID              string         `json:"id"`
	LayoutCode      string         `json:"layout_code"`
	HeroDisplayCode string         `json:"hero_display_code,omitempty"`
	TypeCode        string         `json:"type_code"`
	Pinned          bool           `json:"pinned"`
	Weight          int            `json:"weight"`
	TagText         string         `json:"tag_text"`
	Title           string         `json:"title"`
	Summary         string         `json:"summary"`
	CoverURL        string         `json:"cover_url"`
	PublishedAt     string         `json:"published_at"`
	TimeText        string         `json:"time_text"`
	Source          *mpNewsSource  `json:"source,omitempty"`
	Content         *mpNewsContent `json:"content,omitempty"`
}

func MpNewsList() gin.HandlerFunc {
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
		items := mpMockNews(now)

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

func MpNewsDetail() gin.HandlerFunc {
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
		items := mpMockNews(now)
		for _, it := range items {
			if it.ID != id {
				continue
			}
			c.JSON(200, gin.H{
				"ok":               true,
				"generated_at_utc": time.Now().UTC().Format(time.RFC3339Nano),
				"tz":               tzName,
				"base_url":         baseURL,
				"item":             it,
			})
			return
		}
		c.JSON(http.StatusNotFound, gin.H{"ok": false, "error": "news_not_found"})
	}
}

func mpMockNews(now time.Time) []mpNewsItem {
	items := []mpNewsItem{
		{
			ID:              "n_20260526_hero_rules",
			LayoutCode:      "HERO",
			HeroDisplayCode: "BANNER",
			TypeCode:        "REGULATION",
			Pinned:          true,
			Weight:          980,
			TagText:         "FIA / 规则",
			Title:           "2026 赛季新规要点速览：动力单元与空气动力学方向",
			Summary:         "整理动力单元、电能占比、DRS 变化等核心信息，方便快速了解新规影响。",
			CoverURL:        "/static/circuits/2026/raw/shanghai_map.webp",
			PublishedAt:     "2026-05-26T08:40:00+08:00",
			Source:          &mpNewsSource{Name: "FIA", URL: ""},
			Content: &mpNewsContent{
				FormatCode: "PLAIN",
				Text:       "这里先做占位。后续接入接口后，可以把正文以富文本（rich-text）或 WebView 阅读原文的方式展示。",
			},
		},
		{
			ID:              "n_20260526_hero_paddock",
			LayoutCode:      "HERO",
			HeroDisplayCode: "BANNER",
			TypeCode:        "PADDOCK",
			Pinned:          false,
			Weight:          900,
			TagText:         "围场动态",
			Title:           "本周末焦点事件追踪：升级、处罚与关键发车位变动",
			Summary:         "将练习赛后信息按“升级/处罚/排位节奏”聚合，便于快速抓住关注点。",
			CoverURL:        "/static/circuits/2026/raw/monaco_map.webp",
			PublishedAt:     "2026-05-26T07:50:00+08:00",
			Source:          &mpNewsSource{Name: "Paddock", URL: ""},
			Content:         &mpNewsContent{FormatCode: "PLAIN", Text: "这里先做占位。后续可接入聚合资讯正文。"},
		},
		{
			ID:          "n_20260526_feat_upgrades",
			LayoutCode:  "FEATURE",
			TypeCode:    "TECH",
			Pinned:      false,
			Weight:      820,
			TagText:     "围场动态",
			Title:       "车队升级进度跟踪：本周末主要部件更新清单",
			Summary:     "按车队梳理前翼、底板、散热与尾翼变化，并标注升级意图与风险点。",
			CoverURL:    "/static/circuits/2026/raw/miami_map.webp",
			PublishedAt: "2026-05-26T06:20:00+08:00",
			Source:      &mpNewsSource{Name: "Paddock", URL: ""},
			Content:     &mpNewsContent{FormatCode: "PLAIN", Text: "这里先做占位。后续正文可从后端聚合并缓存。"},
		},
		{
			ID:          "n_20260525_feat_strategy",
			LayoutCode:  "FEATURE",
			TypeCode:    "STRATEGY",
			Pinned:      false,
			Weight:      760,
			TagText:     "赛道 / 轮胎",
			Title:       "本站轮胎策略前瞻：长距离衰减与进站窗口推演",
			Summary:     "结合练习赛长距离与历史数据，给出 1/2 停策略对比与关键触发条件。",
			CoverURL:    "/static/circuits/2026/raw/monaco_map.webp",
			PublishedAt: "2026-05-25T21:10:00+08:00",
			Source:      &mpNewsSource{Name: "Strategy Desk", URL: ""},
			Content:     &mpNewsContent{FormatCode: "PLAIN", Text: "这里先做占位。后续可以加入策略图表与关键段落高亮。"},
		},
		{
			ID:          "n_20260525_std_driver",
			LayoutCode:  "STANDARD",
			TypeCode:    "DRIVER",
			Pinned:      false,
			Weight:      620,
			TagText:     "人物",
			Title:       "车手专访节选：如何在高温下保持轮胎温度窗口",
			Summary:     "从驾驶风格、刹车点与能量回收入手，拆解“保胎”的具体操作。",
			CoverURL:    "/static/circuits/2026/raw/suzuka_map.webp",
			PublishedAt: "2026-05-25T11:35:00+08:00",
			Source:      &mpNewsSource{Name: "Interview", URL: ""},
			Content:     &mpNewsContent{FormatCode: "PLAIN", Text: "这里先做占位。后续可以支持分段引用、收藏与分享。"},
		},
		{
			ID:          "n_20260526_bullet_1",
			LayoutCode:  "BULLETIN",
			TypeCode:    "PADDOCK",
			Pinned:      false,
			Weight:      540,
			TagText:     "快讯",
			Title:       "练习赛出现红旗，赛会通报清理时间约 12 分钟",
			Summary:     "快讯占位：后续可用于高频小消息的行式布局。",
			CoverURL:    "",
			PublishedAt: "2026-05-26T09:05:00+08:00",
			Source:      &mpNewsSource{Name: "Race Control", URL: ""},
			Content:     &mpNewsContent{FormatCode: "PLAIN", Text: "快讯占位正文。"},
		},
		{
			ID:          "n_20260526_bullet_2",
			LayoutCode:  "BULLETIN",
			TypeCode:    "PADDOCK",
			Pinned:      false,
			Weight:      520,
			TagText:     "快讯",
			Title:       "赛会更新：部分弯道限界点位将加强监控",
			Summary:     "快讯占位：后续可用于处罚/公告/赛会通告等短内容。",
			CoverURL:    "",
			PublishedAt: "2026-05-26T08:55:00+08:00",
			Source:      &mpNewsSource{Name: "Stewards", URL: ""},
			Content:     &mpNewsContent{FormatCode: "PLAIN", Text: "快讯占位正文。"},
		},
	}

	for i := range items {
		items[i].TimeText = mpRelativeTime(items[i].PublishedAt, now)
	}

	out := make([]mpNewsItem, 0, len(items))
	for _, it := range items {
		out = append(out, it)
	}

	for i := 0; i < len(out)-1; i++ {
		for j := i + 1; j < len(out); j++ {
			if mpNewsLess(out[i], out[j]) {
				continue
			}
			out[i], out[j] = out[j], out[i]
		}
	}
	return out
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
