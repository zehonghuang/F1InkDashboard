package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"toinc_f1_backend/internal/cache"
	"toinc_f1_backend/internal/config"
	"toinc_f1_backend/internal/f1db"
	"toinc_f1_backend/internal/f1logic"
	"toinc_f1_backend/internal/thirdparty"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func Pages(cfg config.Config, db *gorm.DB, cch *cache.TTLCache, staticDir string) gin.HandlerFunc {
	return func(c *gin.Context) {
		out, code := buildPagesResponse(c.Request.Context(), cfg, db, cch, staticDir, c)
		if code != 0 {
			c.JSON(code, out)
			return
		}
		c.JSON(200, out)
	}
}

func PagesRaceDay(cfg config.Config, db *gorm.DB, cch *cache.TTLCache, staticDir string) gin.HandlerFunc {
	return func(c *gin.Context) {
		out, code := buildPagesResponse(c.Request.Context(), cfg, db, cch, staticDir, c)
		if code != 0 {
			c.JSON(code, out)
			return
		}
		raceDay := out["race_day"]
		c.JSON(200, gin.H{
			"generated_at_utc": out["generated_at_utc"],
			"tz":               out["tz"],
			"race_day":         raceDay,
		})
	}
}

func PagesOffWeek(cfg config.Config, db *gorm.DB, cch *cache.TTLCache, staticDir string) gin.HandlerFunc {
	return func(c *gin.Context) {
		out, code := buildPagesResponse(c.Request.Context(), cfg, db, cch, staticDir, c)
		if code != 0 {
			c.JSON(code, out)
			return
		}
		offWeek := out["off_week"]
		c.JSON(200, gin.H{
			"generated_at_utc": out["generated_at_utc"],
			"tz":               out["tz"],
			"off_week":         offWeek,
		})
	}
}

func UiPages(cfg config.Config, db *gorm.DB, cch *cache.TTLCache, staticDir string) gin.HandlerFunc {
	return func(c *gin.Context) {
		pages, code := buildPagesResponse(c.Request.Context(), cfg, db, cch, staticDir, c)
		if code != 0 {
			c.JSON(code, pages)
			return
		}
		season := toIntQuery(c, "season", 2026)
		lang := strings.TrimSpace(c.GetString("language"))
		ui := f1logic.BuildUiPagesPayload(pages, season, lang)
		c.JSON(200, ui)
	}
}

func UiPagesRaceDay(cfg config.Config, db *gorm.DB, cch *cache.TTLCache, staticDir string) gin.HandlerFunc {
	return func(c *gin.Context) {
		pages, code := buildPagesResponse(c.Request.Context(), cfg, db, cch, staticDir, c)
		if code != 0 {
			c.JSON(code, pages)
			return
		}
		season := toIntQuery(c, "season", 2026)
		lang := strings.TrimSpace(c.GetString("language"))
		ui := f1logic.BuildUiPagesPayload(pages, season, lang)
		pg, _ := ui["pages"].(map[string]any)
		c.JSON(200, gin.H{
			"generated_at_utc": ui["generated_at_utc"],
			"tz":               ui["tz"],
			"format":           ui["format"],
			"race_day":         pg["race_day"],
		})
	}
}

func UiPagesOffWeek(cfg config.Config, db *gorm.DB, cch *cache.TTLCache, staticDir string) gin.HandlerFunc {
	return func(c *gin.Context) {
		pages, code := buildPagesResponse(c.Request.Context(), cfg, db, cch, staticDir, c)
		if code != 0 {
			c.JSON(code, pages)
			return
		}
		season := toIntQuery(c, "season", 2026)
		lang := strings.TrimSpace(c.GetString("language"))
		ui := f1logic.BuildUiPagesPayload(pages, season, lang)
		pg, _ := ui["pages"].(map[string]any)
		c.JSON(200, gin.H{
			"generated_at_utc": ui["generated_at_utc"],
			"tz":               ui["tz"],
			"format":           ui["format"],
			"off_week":         pg["off_week"],
		})
	}
}

func buildPagesResponse(ctx context.Context, cfg config.Config, db *gorm.DB, cch *cache.TTLCache, staticDir string, c *gin.Context) (map[string]any, int) {
	tzName := strings.TrimSpace(c.Query("tz"))
	if tzName == "" {
		tzName = "Asia/Shanghai"
	}
	lang := strings.TrimSpace(c.GetString("language"))
	season := toIntQuery(c, "season", 2026)
	includeCircuit := parseBoolQuery(c, "include_circuit", true)
	refreshCircuit := parseBoolQuery(c, "refresh_circuit", false)

	nowUTC := time.Now().UTC()

	if db == nil {
		LogReqError(c, "pages", "mysql_required", nil)
		return gin.H{"ok": false, "error": "mysql_required"}, http.StatusServiceUnavailable
	}

	scheduleJSON, err := f1db.OpenF1ScheduleJSON(db, season, lang)
	if err != nil {
		LogReqError(c, "pages", "schedule_unavailable", err)
		return gin.H{"ok": false, "error": "schedule_unavailable"}, http.StatusServiceUnavailable
	}

	latestSK, err := f1db.OpenF1LatestRaceSessionKey(db, season)
	if err != nil {
		LogReqError(c, "pages", "championship_unavailable", err)
		return gin.H{"ok": false, "error": "championship_unavailable"}, http.StatusServiceUnavailable
	}

	driverStandings, err := f1db.OpenF1DriverStandingsJSON(db, latestSK, lang, season)
	if err != nil {
		LogReqError(c, "pages", "driver_standings_unavailable", err)
		return gin.H{"ok": false, "error": "driver_standings_unavailable"}, http.StatusServiceUnavailable
	}
	constructorStandings, err := f1db.OpenF1ConstructorStandingsJSON(db, latestSK, lang)
	if err != nil {
		LogReqError(c, "pages", "constructor_standings_unavailable", err)
		return gin.H{"ok": false, "error": "constructor_standings_unavailable"}, http.StatusServiceUnavailable
	}

	lastResults, _ := f1db.OpenF1LastNResultsJSON(db, season, 5, lang)

	weatherAny, _ := cch.GetOrSet("openf1_weather_latest", 30*time.Second, func() (any, error) {
		if v, ok := thirdparty.OpenF1LatestWeather(ctx); ok {
			return v, nil
		}
		return nil, nil
	})

	newsAny, _ := cch.GetOrSet("rss_first_title", 300*time.Second, func() (any, error) {
		if it, ok := thirdparty.FetchRssFirstTitle(ctx); ok {
			return it, nil
		}
		return nil, nil
	})

	var circuitAssets map[string]any
	circuitSource := any(nil)
	if includeCircuit {
		if !refreshCircuit {
			if v, err := f1db.CircuitAssetsPayloadFromDB(db, season, lang); err == nil {
				circuitAssets = v
				circuitSource = "mysql"
			}
		}
		if circuitAssets == nil {
			if v, ok := loadCircuitAssetsFromDisk(staticDir, season); ok {
				circuitAssets = v
				circuitSource = "disk"
			}
		}
	}

	pages := f1logic.BuildPagesPayload(nowUTC, tzName, scheduleJSON, season, driverStandings, constructorStandings, circuitAssets, weatherAny, newsAny, lastResults)

	pages["sources"] = map[string]any{
		"mysql_enabled": true,
		"schedule":      "openf1_mysql",
		"circuit":       circuitSource,
	}

	return pages, 0
}

func loadCircuitAssetsFromDisk(staticDir string, season int) (map[string]any, bool) {
	p := filepath.Join(staticDir, "circuits", strconv.Itoa(season), "circuits.json")
	b, err := os.ReadFile(p)
	if err != nil {
		return nil, false
	}
	var v map[string]any
	if err := json.Unmarshal(b, &v); err != nil {
		return nil, false
	}
	return v, true
}

func toIntQuery(c *gin.Context, key string, def int) int {
	s := strings.TrimSpace(c.Query(key))
	if s == "" {
		return def
	}
	n, err := strconv.Atoi(s)
	if err != nil {
		return def
	}
	return n
}

func parseBoolQuery(c *gin.Context, key string, def bool) bool {
	s := strings.TrimSpace(strings.ToLower(c.Query(key)))
	if s == "" {
		return def
	}
	switch s {
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	default:
		return def
	}
}
