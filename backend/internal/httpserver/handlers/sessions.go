package handlers

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"toinc_f1_backend/internal/cache"
	"toinc_f1_backend/internal/config"
	"toinc_f1_backend/internal/f1db"
	"toinc_f1_backend/internal/f1logic"
	"toinc_f1_backend/internal/model"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// @Summary 查询 session 列表
// @Tags Sessions
// @Produce json
// @Param tz query string false "IANA 时区名称" default(Asia/Shanghai)
// @Param season query int false "赛季年份" default(2026)
// @Param round query int false "分站 round（1-30）"
// @Param session query string false "session 名称过滤；auto 表示按当前时间选择" default(auto)
// @Param q query int false "排位分段（1-3）"
// @Param limit query int false "返回数量限制（1-30）" default(13)
// @Success 200 {object} model.GenericObject
// @Failure 502 {object} model.ErrorResponse
// @Failure 503 {object} model.ErrorResponse
// @Router /api/v1/f1/sessions [get]
func F1Sessions(cfg config.Config, db *gorm.DB, cch *cache.TTLCache) gin.HandlerFunc {
	return func(c *gin.Context) {
		if db == nil {
			LogReqError(c, "f1_sessions", "mysql_required", nil)
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "mysql_required"})
			return
		}
		tz := strings.TrimSpace(c.Query("tz"))
		if tz == "" {
			tz = "Asia/Shanghai"
		}
		lang := strings.TrimSpace(c.GetString("language"))
		season := toIntQuery(c, "season", 2026)
		var roundOverride *int
		if s := strings.TrimSpace(c.Query("round")); s != "" {
			if n, err := strconv.Atoi(s); err == nil {
				if n >= 1 && n <= 30 {
					roundOverride = &n
				}
			}
		}
		session := strings.TrimSpace(c.Query("session"))
		if session == "" {
			session = "auto"
		}
		var q *int
		if s := strings.TrimSpace(c.Query("q")); s != "" {
			if n, err := strconv.Atoi(s); err == nil {
				if n >= 1 && n <= 3 {
					q = &n
				}
			}
		}
		limit := toIntQuery(c, "limit", 13)
		if limit < 1 {
			limit = 1
		}
		if limit > 30 {
			limit = 30
		}

		key := "openf1_schedule_" + strconv.Itoa(season) + "_" + lang
		scheduleAny, err := cch.GetOrSet(key, 30*time.Second, func() (any, error) {
			return f1db.OpenF1ScheduleJSON(db, season, lang)
		})
		if err != nil {
			LogReqError(c, "f1_sessions", "schedule_unavailable", err)
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "schedule_unavailable"})
			return
		}
		scheduleJSON, _ := scheduleAny.(map[string]any)
		if scheduleJSON == nil {
			LogReqError(c, "f1_sessions", "schedule_unavailable", nil)
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "schedule_unavailable"})
			return
		}

		nowUTC := time.Now().UTC()
		out, err := f1logic.BuildSessionsPayload(db, nowUTC, tz, scheduleJSON, season, roundOverride, session, q, limit)
		if err != nil {
			LogReqError(c, "f1_sessions", "build_failed", err)
			c.JSON(502, model.ErrorResponse{Ok: false, Error: "build_failed"})
			return
		}
		c.JSON(200, out)
	}
}

func F1SessionsCurrent(cfg config.Config, db *gorm.DB, cch *cache.TTLCache) gin.HandlerFunc {
	base := F1Sessions(cfg, db, cch)
	return func(c *gin.Context) {
		c.Request.URL.RawQuery = strings.ReplaceAll(c.Request.URL.RawQuery, "session=", "")
		base(c)
	}
}

// @Summary 当前 session（显式 current）
// @Description 固定 session=auto，语义等价于 /api/v1/f1/sessions?session=auto。
// @Tags Sessions
// @Produce json
// @Param tz query string false "IANA 时区名称" default(Asia/Shanghai)
// @Param season query int false "赛季年份" default(2026)
// @Param round query int false "分站 round（1-30）"
// @Param q query int false "排位分段（1-3）"
// @Param limit query int false "返回数量限制（1-30）" default(13)
// @Success 200 {object} model.GenericObject
// @Failure 502 {object} model.ErrorResponse
// @Failure 503 {object} model.ErrorResponse
// @Router /api/v1/f1/sessions/current [get]
func F1SessionsCurrentExplicit(cfg config.Config, db *gorm.DB, cch *cache.TTLCache) gin.HandlerFunc {
	return func(c *gin.Context) {
		if db == nil {
			LogReqError(c, "f1_sessions_current", "mysql_required", nil)
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "mysql_required"})
			return
		}
		tz := strings.TrimSpace(c.Query("tz"))
		if tz == "" {
			tz = "Asia/Shanghai"
		}
		lang := strings.TrimSpace(c.GetString("language"))
		season := toIntQuery(c, "season", 2026)
		var roundOverride *int
		if s := strings.TrimSpace(c.Query("round")); s != "" {
			if n, err := strconv.Atoi(s); err == nil {
				if n >= 1 && n <= 30 {
					roundOverride = &n
				}
			}
		}
		var q *int
		if s := strings.TrimSpace(c.Query("q")); s != "" {
			if n, err := strconv.Atoi(s); err == nil {
				if n >= 1 && n <= 3 {
					q = &n
				}
			}
		}
		limit := toIntQuery(c, "limit", 13)
		if limit < 1 {
			limit = 1
		}
		if limit > 30 {
			limit = 30
		}

		key := "openf1_schedule_" + strconv.Itoa(season) + "_" + lang
		scheduleAny, err := cch.GetOrSet(key, 30*time.Second, func() (any, error) {
			return f1db.OpenF1ScheduleJSON(db, season, lang)
		})
		if err != nil {
			LogReqError(c, "f1_sessions_current", "schedule_unavailable", err)
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "schedule_unavailable"})
			return
		}
		scheduleJSON, _ := scheduleAny.(map[string]any)
		if scheduleJSON == nil {
			LogReqError(c, "f1_sessions_current", "schedule_unavailable", nil)
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "schedule_unavailable"})
			return
		}

		nowUTC := time.Now().UTC()
		out, err := f1logic.BuildSessionsPayload(db, nowUTC, tz, scheduleJSON, season, roundOverride, "auto", q, limit)
		if err != nil {
			LogReqError(c, "f1_sessions_current", "build_failed", err)
			c.JSON(502, model.ErrorResponse{Ok: false, Error: "build_failed"})
			return
		}
		out["request_mode"] = "auto_by_time"
		c.JSON(200, out)
	}
}

// @Summary 按路径获取 session 文件
// @Description 读取静态 session 文件（session_name 会自动去掉 .json 后缀）。
// @Tags Sessions
// @Produce json
// @Param season path int true "赛季年份"
// @Param round path int true "分站 round（1-30）"
// @Param session_name path string true "session 名称（可带 .json）"
// @Param tz query string false "IANA 时区名称" default(Asia/Shanghai)
// @Param q query int false "排位分段（1-3）"
// @Param limit query int false "返回数量限制（1-30）" default(13)
// @Success 200 {object} model.GenericObject
// @Failure 502 {object} model.ErrorResponse
// @Failure 503 {object} model.ErrorResponse
// @Router /api/v1/f1/sessions/{season}/{round}/{session_name} [get]
func F1SessionsByPath(cfg config.Config, db *gorm.DB, cch *cache.TTLCache) gin.HandlerFunc {
	return func(c *gin.Context) {
		if db == nil {
			LogReqError(c, "f1_sessions_by_path", "mysql_required", nil)
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "mysql_required"})
			return
		}
		tz := strings.TrimSpace(c.Query("tz"))
		if tz == "" {
			tz = "Asia/Shanghai"
		}
		lang := strings.TrimSpace(c.GetString("language"))
		season, _ := strconv.Atoi(strings.TrimSpace(c.Param("season")))
		round, _ := strconv.Atoi(strings.TrimSpace(c.Param("round")))
		sessionName := strings.TrimSpace(c.Param("session_name"))
		sessionName = strings.TrimSuffix(sessionName, ".json")
		var q *int
		if s := strings.TrimSpace(c.Query("q")); s != "" {
			if n, err := strconv.Atoi(s); err == nil {
				if n >= 1 && n <= 3 {
					q = &n
				}
			}
		}
		limit := toIntQuery(c, "limit", 13)
		if limit < 1 {
			limit = 1
		}
		if limit > 30 {
			limit = 30
		}

		key := "openf1_schedule_" + strconv.Itoa(season) + "_" + lang
		scheduleAny, err := cch.GetOrSet(key, 30*time.Second, func() (any, error) {
			return f1db.OpenF1ScheduleJSON(db, season, lang)
		})
		if err != nil {
			LogReqError(c, "f1_sessions_by_path", "schedule_unavailable", err)
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "schedule_unavailable"})
			return
		}
		scheduleJSON, _ := scheduleAny.(map[string]any)
		if scheduleJSON == nil {
			LogReqError(c, "f1_sessions_by_path", "schedule_unavailable", nil)
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "schedule_unavailable"})
			return
		}

		nowUTC := time.Now().UTC()
		roundOverride := round
		out, err := f1logic.BuildSessionsPayload(db, nowUTC, tz, scheduleJSON, season, &roundOverride, sessionName, q, limit)
		if err != nil {
			LogReqError(c, "f1_sessions_by_path", "build_failed", err)
			c.JSON(502, model.ErrorResponse{Ok: false, Error: "build_failed"})
			return
		}
		c.JSON(200, out)
	}
}
