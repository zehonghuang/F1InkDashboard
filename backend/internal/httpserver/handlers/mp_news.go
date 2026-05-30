package handlers

import (
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	"toinc_f1_backend/internal/model"

	"github.com/gin-gonic/gin"
)

// @Summary 小程序新闻列表
// @Description 分页返回新闻条目列表（不包含 content）。
// @Tags MiniProgram
// @Produce json
// @Param tz query string false "IANA 时区名称" default(Asia/Shanghai)
// @Param page query int false "页码，从 1 开始" default(1)
// @Param page_size query int false "每页数量（最大 50）" default(20)
// @Success 200 {object} model.MpNewsListResponse
// @Failure 500 {object} model.ErrorResponse
// @Router /api/v1/mp/news [get]
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
			c.JSON(500, model.ErrorResponse{Ok: false, Error: "news_unavailable"})
			return
		}

		idsQuery := strings.TrimSpace(c.Query("ids"))
		tagQuery := strings.TrimSpace(c.Query("tag"))
		qQuery := strings.TrimSpace(c.Query("q"))
		typeCodesQuery := strings.TrimSpace(c.Query("type_code"))
		layoutCodesQuery := strings.TrimSpace(c.Query("layout_code"))
		sortQuery := strings.ToLower(strings.TrimSpace(c.Query("sort")))
		sinceQuery := strings.TrimSpace(c.Query("since"))

		hasPinned := strings.TrimSpace(c.Query("pinned")) != ""
		pinnedVal := parseBoolQuery(c, "pinned", false)

		idsSet := make(map[string]struct{})
		if idsQuery != "" {
			for _, s := range strings.Split(idsQuery, ",") {
				k := strings.TrimSpace(s)
				if k == "" {
					continue
				}
				idsSet[k] = struct{}{}
			}
		}

		typeSet := make(map[string]struct{})
		if typeCodesQuery != "" {
			for _, s := range strings.Split(typeCodesQuery, ",") {
				k := strings.TrimSpace(strings.ToUpper(s))
				if k == "" {
					continue
				}
				typeSet[k] = struct{}{}
			}
		}

		layoutSet := make(map[string]struct{})
		if layoutCodesQuery != "" {
			for _, s := range strings.Split(layoutCodesQuery, ",") {
				k := strings.TrimSpace(strings.ToUpper(s))
				if k == "" {
					continue
				}
				layoutSet[k] = struct{}{}
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

		filtered := make([]model.MpNewsItem, 0, len(items))
		for _, it := range items {
			if len(idsSet) > 0 {
				if _, ok := idsSet[it.ID]; !ok {
					continue
				}
			}
			if hasPinned && it.Pinned != pinnedVal {
				continue
			}
			if len(typeSet) > 0 {
				if _, ok := typeSet[string(it.TypeCode)]; !ok {
					continue
				}
			}
			if len(layoutSet) > 0 {
				if _, ok := layoutSet[string(it.LayoutCode)]; !ok {
					continue
				}
			}
			if tagQuery != "" {
				hay := strings.ToLower(strings.TrimSpace(it.TagText + " " + it.Title + " " + it.Summary))
				if !strings.Contains(hay, strings.ToLower(tagQuery)) {
					found := false
					for _, t := range it.Tags {
						if strings.EqualFold(strings.TrimSpace(t), tagQuery) {
							found = true
							break
						}
					}
					if !found {
						continue
					}
				}
			}
			if qQuery != "" {
				hay := strings.ToLower(strings.TrimSpace(it.TagText + " " + it.Title + " " + it.Summary))
				if !strings.Contains(hay, strings.ToLower(qQuery)) {
					continue
				}
			}
			if hasSince {
				at, err := time.Parse(time.RFC3339, strings.TrimSpace(it.PublishedAt))
				if err != nil {
					continue
				}
				if !at.After(sinceTime) {
					continue
				}
			}
			filtered = append(filtered, it)
		}

		switch sortQuery {
		case "", "default":
		case "published_at_desc":
			sort.SliceStable(filtered, func(i, j int) bool {
				at, _ := time.Parse(time.RFC3339, strings.TrimSpace(filtered[i].PublishedAt))
				bt, _ := time.Parse(time.RFC3339, strings.TrimSpace(filtered[j].PublishedAt))
				return at.After(bt)
			})
		case "published_at_asc":
			sort.SliceStable(filtered, func(i, j int) bool {
				at, _ := time.Parse(time.RFC3339, strings.TrimSpace(filtered[i].PublishedAt))
				bt, _ := time.Parse(time.RFC3339, strings.TrimSpace(filtered[j].PublishedAt))
				return at.Before(bt)
			})
		default:
			c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: "bad_sort"})
			return
		}

		total := len(filtered)
		start := (page - 1) * pageSize
		if start > total {
			start = total
		}
		end := start + pageSize
		if end > total {
			end = total
		}

		out := make([]model.MpNewsItem, 0, end-start)
		for _, it := range filtered[start:end] {
			cp := it
			cp.Source = nil
			cp.Content = nil
			out = append(out, cp)
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
// @Router /api/v1/mp/news/{id} [get]
func MpNewsDetail(staticDir string) gin.HandlerFunc {
	return func(c *gin.Context) {
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
		it, err := mpNewsLoadItem(staticDir, id, now)
		if err != nil {
			if err == errMpNewsNotFound {
				c.JSON(http.StatusNotFound, model.ErrorResponse{Ok: false, Error: "news_not_found"})
				return
			}
			c.JSON(500, model.ErrorResponse{Ok: false, Error: "news_unavailable"})
			return
		}
		c.JSON(200, model.MpNewsDetailResponse{
			Ok:             true,
			GeneratedAtUTC: time.Now().UTC().Format(time.RFC3339Nano),
			Tz:             tzName,
			BaseURL:        baseURL,
			Item:           *it,
		})
	}
}

func mpNewsLess(a, b model.MpNewsItem) bool {
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
