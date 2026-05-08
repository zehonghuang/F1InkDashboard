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

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func F1Sessions(cfg config.Config, db *gorm.DB, cch *cache.TTLCache) gin.HandlerFunc {
	return func(c *gin.Context) {
		if db == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"ok": false, "error": "mysql_required"})
			return
		}
		tz := strings.TrimSpace(c.Query("tz"))
		if tz == "" {
			tz = "Asia/Shanghai"
		}
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

		key := "openf1_schedule_" + strconv.Itoa(season)
		scheduleAny, err := cch.GetOrSet(key, 30*time.Second, func() (any, error) {
			return f1db.OpenF1ScheduleJSON(db, season)
		})
		if err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"ok": false, "error": "schedule_unavailable"})
			return
		}
		scheduleJSON, _ := scheduleAny.(map[string]any)
		if scheduleJSON == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"ok": false, "error": "schedule_unavailable"})
			return
		}

		nowUTC := time.Now().UTC()
		out, err := f1logic.BuildSessionsPayload(db, nowUTC, tz, scheduleJSON, season, roundOverride, session, q, limit)
		if err != nil {
			c.JSON(502, gin.H{"ok": false, "error": "build_failed"})
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

func F1SessionsCurrentExplicit(cfg config.Config, db *gorm.DB, cch *cache.TTLCache) gin.HandlerFunc {
	return func(c *gin.Context) {
		if db == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"ok": false, "error": "mysql_required"})
			return
		}
		tz := strings.TrimSpace(c.Query("tz"))
		if tz == "" {
			tz = "Asia/Shanghai"
		}
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

		key := "openf1_schedule_" + strconv.Itoa(season)
		scheduleAny, err := cch.GetOrSet(key, 30*time.Second, func() (any, error) {
			return f1db.OpenF1ScheduleJSON(db, season)
		})
		if err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"ok": false, "error": "schedule_unavailable"})
			return
		}
		scheduleJSON, _ := scheduleAny.(map[string]any)
		if scheduleJSON == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"ok": false, "error": "schedule_unavailable"})
			return
		}

		nowUTC := time.Now().UTC()
		out, err := f1logic.BuildSessionsPayload(db, nowUTC, tz, scheduleJSON, season, roundOverride, "auto", q, limit)
		if err != nil {
			c.JSON(502, gin.H{"ok": false, "error": "build_failed"})
			return
		}
		out["request_mode"] = "auto_by_time"
		c.JSON(200, out)
	}
}

func F1SessionsByPath(cfg config.Config, db *gorm.DB, cch *cache.TTLCache) gin.HandlerFunc {
	return func(c *gin.Context) {
		if db == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"ok": false, "error": "mysql_required"})
			return
		}
		tz := strings.TrimSpace(c.Query("tz"))
		if tz == "" {
			tz = "Asia/Shanghai"
		}
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

		key := "openf1_schedule_" + strconv.Itoa(season)
		scheduleAny, err := cch.GetOrSet(key, 30*time.Second, func() (any, error) {
			return f1db.OpenF1ScheduleJSON(db, season)
		})
		if err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"ok": false, "error": "schedule_unavailable"})
			return
		}
		scheduleJSON, _ := scheduleAny.(map[string]any)
		if scheduleJSON == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"ok": false, "error": "schedule_unavailable"})
			return
		}

		nowUTC := time.Now().UTC()
		roundOverride := round
		out, err := f1logic.BuildSessionsPayload(db, nowUTC, tz, scheduleJSON, season, &roundOverride, sessionName, q, limit)
		if err != nil {
			c.JSON(502, gin.H{"ok": false, "error": "build_failed"})
			return
		}
		c.JSON(200, out)
	}
}
