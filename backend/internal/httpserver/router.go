package httpserver

import (
	"toinc_f1_backend/internal/cache"
	"toinc_f1_backend/internal/config"
	"toinc_f1_backend/internal/db"
	"toinc_f1_backend/internal/httpserver/handlers"
	"toinc_f1_backend/internal/ws"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type Server struct {
	Router    *gin.Engine
	DB        *db.DB
	Config    config.Config
	Cache     *cache.TTLCache
	EchoHub   *ws.Hub
	NewsHub   *ws.Hub
	OpenF1Hub *ws.Hub
}

func New(cfg config.Config, database *db.DB) *Server {
	s := &Server{
		Router:    gin.New(),
		DB:        database,
		Config:    cfg,
		Cache:     cache.New(),
		EchoHub:   ws.NewHub(),
		NewsHub:   ws.NewHub(),
		OpenF1Hub: ws.NewHub(),
	}

	s.Router.Use(gin.Recovery())
	_ = s.Router.SetTrustedProxies(cfg.TrustedProxies)
	s.Router.Use(RequestLogger(cfg.LogRequests))

	s.Router.GET("/health", handlers.Health())

	s.Router.Static("/static", cfg.StaticDir)
	s.Router.Static("/update", cfg.UpdateDir)

	s.Router.GET("/api/v1/epd/frame.bin", handlers.EpdFrameBin())
	s.Router.GET("/api/v1/epd/frame.png", handlers.EpdFramePng())

	s.Router.GET("/api/v1/charts/driver/:driver_number/latest.png", handlers.ChartsDriverLatestPng(cfg.StaticDir))
	s.Router.GET("/api/v1/charts/driver/:driver_number/latest.json", handlers.ChartsDriverLatestJSON(cfg.StaticDir))

	s.Router.GET("/api/v1/ws/status", handlers.WsStatus(s.EchoHub))
	s.Router.Any("/api/v1/ws/broadcast", handlers.WsBroadcast(s.EchoHub))
	s.Router.GET("/ws", handlers.WsEcho(s.EchoHub))

	s.Router.GET("/api/v1/news/ws/status", handlers.NewsWsStatus(cfg, s.NewsHub))
	s.Router.POST("/api/v1/news/ws/ingest", handlers.NewsWsIngest(cfg, s.NewsHub, cfg.StaticDir))
	s.Router.POST("/api/v1/news/meme/ws/ingest", handlers.NewsMemeWsIngest(cfg, s.NewsHub, cfg.StaticDir))
	s.Router.POST("/api/v1/news/ingest", handlers.NewsIngestJSON(cfg, s.NewsHub, cfg.StaticDir))
	s.Router.GET("/ws/news", handlers.WsNews(cfg, s.NewsHub))

	s.Router.GET("/api/v1/openf1/status", handlers.OpenF1Status(cfg, s.OpenF1Hub))
	s.Router.POST("/api/v1/openf1/ingest", handlers.OpenF1Ingest(cfg, s.OpenF1Hub))
	s.Router.GET("/ws/openf1", handlers.WsOpenF1(cfg, s.OpenF1Hub))
	s.Router.GET("/ws/openf1/raw", handlers.WsOpenF1(cfg, s.OpenF1Hub))
	s.Router.GET("/ws/openf1/ingest", handlers.OpenF1IngestWS(cfg, s.OpenF1Hub))

	s.Router.GET("/api/v1/pages", handlers.Pages(cfg, gormOrNil(database), s.Cache, cfg.StaticDir))
	s.Router.GET("/api/v1/pages/race-day", handlers.PagesRaceDay(cfg, gormOrNil(database), s.Cache, cfg.StaticDir))
	s.Router.GET("/api/v1/pages/off-week", handlers.PagesOffWeek(cfg, gormOrNil(database), s.Cache, cfg.StaticDir))
	s.Router.GET("/api/v1/ui/pages", handlers.UiPages(cfg, gormOrNil(database), s.Cache, cfg.StaticDir))
	s.Router.GET("/api/v1/ui/pages/race-day", handlers.UiPagesRaceDay(cfg, gormOrNil(database), s.Cache, cfg.StaticDir))
	s.Router.GET("/api/v1/ui/pages/off-week", handlers.UiPagesOffWeek(cfg, gormOrNil(database), s.Cache, cfg.StaticDir))

	s.Router.GET("/api/v1/mp/archive", handlers.MpArchive(gormOrNil(database), cfg.StaticDir))
	s.Router.GET("/api/v1/mp/race-sessions", handlers.MpRaceSessions(gormOrNil(database)))
	s.Router.GET("/api/v1/mp/session-results", handlers.MpSessionResults(gormOrNil(database)))
	s.Router.GET("/api/v1/mp/telemetry/controls", handlers.MpTelemetryControls(gormOrNil(database)))
	s.Router.GET("/api/v1/mp/telemetry/sector_controls", handlers.MpTelemetrySectorControls(gormOrNil(database)))

	s.Router.GET("/api/v1/f1/sessions", handlers.F1Sessions(cfg, gormOrNil(database), s.Cache))
	s.Router.GET("/api/v1/f1/sessions/current", handlers.F1SessionsCurrentExplicit(cfg, gormOrNil(database), s.Cache))
	s.Router.GET("/api/v1/f1/sessions/:season/:round/:session_name", handlers.F1SessionsByPath(cfg, gormOrNil(database), s.Cache))

	s.Router.GET("/api/v1/telemetry/laps/available", handlers.TelemetryLapsAvailable(gormOrNil(database)))
	s.Router.GET("/api/v1/telemetry/laps", handlers.TelemetryLaps(gormOrNil(database)))
	s.Router.GET("/api/v1/telemetry/lap_controls", handlers.TelemetryLapControls(gormOrNil(database)))
	s.Router.GET("/api/v1/telemetry/lap_controls_series", handlers.TelemetryLapControlsSeries(gormOrNil(database)))
	s.Router.GET("/api/v1/telemetry/lap_trace", handlers.TelemetryLapTrace(gormOrNil(database)))
	s.Router.GET("/api/v1/telemetry/fastest_lap", handlers.TelemetryFastestLap(gormOrNil(database)))

	handlers.RegisterCompatPlaceholders(s.Router)

	return s
}

func gormOrNil(database *db.DB) *gorm.DB {
	if database == nil {
		return nil
	}
	return database.Gorm
}
