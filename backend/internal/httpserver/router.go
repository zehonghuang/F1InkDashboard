package httpserver

import (
	"toinc_f1_backend/internal/cache"
	"toinc_f1_backend/internal/config"
	"toinc_f1_backend/internal/db"
	"toinc_f1_backend/internal/f1livetiming"
	"toinc_f1_backend/internal/httpserver/handlers"
	"toinc_f1_backend/internal/motorsportlive"
	"toinc_f1_backend/internal/openf1scheduler"
	"toinc_f1_backend/internal/tasks"
	"toinc_f1_backend/internal/teamdrivercache"
	"toinc_f1_backend/internal/ws"

	_ "toinc_f1_backend/docs"

	"github.com/gin-gonic/gin"
	swaggerFiles "github.com/swaggo/files"
	ginSwagger "github.com/swaggo/gin-swagger"
	"gorm.io/gorm"
)

type Server struct {
	Router            *gin.Engine
	DB                *db.DB
	Config            config.Config
	Cache             *cache.TTLCache
	TeamCache         *teamdrivercache.Manager
	EchoHub           *ws.Hub
	NewsHub           *ws.Hub
	OpenF1Hub         *ws.Hub
	F1LiveTimingHub   *ws.Hub
	F1LiveTiming      *f1livetiming.Manager
	MotorsportLiveHub *ws.Hub
	MotorsportLive    *motorsportlive.Manager
}

func New(cfg config.Config, database *db.DB) *Server {
	f1LiveTimingHub := ws.NewHub()
	f1LiveTimingMgr := f1livetiming.New(cfg, gormOrNil(database), f1LiveTimingHub)
	motorsportLiveHub := ws.NewHub()
	motorsportLiveMgr := motorsportlive.New(cfg, gormOrNil(database), motorsportLiveHub)
	s := &Server{
		Router:            gin.New(),
		DB:                database,
		Config:            cfg,
		Cache:             cache.New(),
		TeamCache:         teamdrivercache.New(gormOrNil(database), cfg.StaticDir),
		EchoHub:           ws.NewHub(),
		NewsHub:           ws.NewHub(),
		OpenF1Hub:         ws.NewHub(),
		F1LiveTimingHub:   f1LiveTimingHub,
		F1LiveTiming:      f1LiveTimingMgr,
		MotorsportLiveHub: motorsportLiveHub,
		MotorsportLive:    motorsportLiveMgr,
	}
	s.TeamCache.Start()
	s.F1LiveTiming.Start()
	s.MotorsportLive.Start()

	s.Router.Use(gin.Recovery())
	_ = s.Router.SetTrustedProxies(cfg.TrustedProxies)
	s.Router.Use(RequestLogger(cfg.LogRequests))
	s.Router.Use(LanguageMiddleware("en-US"))

	s.Router.GET("/health", handlers.Health())

	s.Router.Static("/static", cfg.StaticDir)
	s.Router.Static("/update", cfg.UpdateDir)
	s.Router.GET("/swagger/*any", ginSwagger.WrapHandler(swaggerFiles.Handler))

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
	s.Router.GET("/ws/f1/live-timing", handlers.WsF1LiveTiming(cfg, s.F1LiveTiming, s.F1LiveTimingHub))
	s.Router.GET("/ws/mp/f1/live-timing", handlers.WsMpF1LiveTiming(s.F1LiveTiming, s.F1LiveTimingHub))
	s.Router.GET("/ws/motorsport/live", handlers.WsMotorsportLive(s.MotorsportLive, s.MotorsportLiveHub))

	s.Router.GET("/api/v1/pages", handlers.Pages(cfg, gormOrNil(database), s.Cache, cfg.StaticDir))
	s.Router.GET("/api/v1/pages/race-day", handlers.PagesRaceDay(cfg, gormOrNil(database), s.Cache, cfg.StaticDir))
	s.Router.GET("/api/v1/pages/off-week", handlers.PagesOffWeek(cfg, gormOrNil(database), s.Cache, cfg.StaticDir))
	s.Router.GET("/api/v1/ui/pages", handlers.UiPages(cfg, gormOrNil(database), s.Cache, cfg.StaticDir))
	s.Router.GET("/api/v1/ui/pages/race-day", handlers.UiPagesRaceDay(cfg, gormOrNil(database), s.Cache, cfg.StaticDir))
	s.Router.GET("/api/v1/ui/pages/off-week", handlers.UiPagesOffWeek(cfg, gormOrNil(database), s.Cache, cfg.StaticDir))

	s.Router.POST("/api/v1/device/boot", handlers.DeviceBoot(gormOrNil(database)))
	s.Router.GET("/api/v1/device/:device_id/user_prefs_kv", handlers.DeviceUserPrefsKV(gormOrNil(database)))

	s.Router.GET("/api/v1/mp/archive", handlers.MpArchive(gormOrNil(database), cfg.StaticDir))
	s.Router.GET("/api/v1/mp/race-week", handlers.MpRaceWeek(gormOrNil(database)))
	s.Router.GET("/api/v1/mp/race-sessions", handlers.MpRaceSessions(gormOrNil(database)))
	s.Router.GET("/api/v1/mp/session-results", handlers.MpSessionResults(gormOrNil(database), s.TeamCache))
	s.Router.GET("/api/v1/mp/session-results/latest-crawled", handlers.MpSessionResultsLatestCrawled(cfg, s.TeamCache))
	s.Router.GET("/api/v1/mp/f1/live-timing", handlers.MpF1LiveTiming(s.F1LiveTiming))
	s.Router.GET("/api/v1/mp/motorsport/live", handlers.MpMotorsportLive(s.MotorsportLive))
	s.Router.GET("/api/v1/mp/standings", handlers.MpStandings(gormOrNil(database), s.TeamCache))
	s.Router.GET("/api/v1/mp/telemetry/controls", handlers.MpTelemetryControls(gormOrNil(database)))
	s.Router.GET("/api/v1/mp/telemetry/sector_controls", handlers.MpTelemetrySectorControls(gormOrNil(database)))
	s.Router.GET("/api/v1/mp/news", handlers.MpNewsList(gormOrNil(database)))
	s.Router.GET("/api/v1/mp/news/:id", handlers.MpNewsDetail(gormOrNil(database)))
	s.Router.POST("/api/v1/mp/news/ingest", handlers.MpNewsIngest(cfg, gormOrNil(database)))

	s.Router.GET("/api/v1/admin/devices", handlers.AdminDevicesList(cfg, gormOrNil(database)))
	s.Router.GET("/api/v1/admin/devices/:device_id", handlers.AdminDeviceDetail(cfg, gormOrNil(database)))
	s.Router.GET("/api/v1/admin/f1/live-timing", handlers.AdminF1LiveTiming(cfg, s.F1LiveTiming))
	s.Router.GET("/api/v1/admin/mp/users", handlers.AdminUsersList(cfg, gormOrNil(database)))
	s.Router.GET("/api/v1/admin/mp/users/:user_id", handlers.AdminUserDetail(cfg, gormOrNil(database)))
	s.Router.GET("/api/v1/admin/motorsport/live-standings", handlers.AdminMotorsportLiveStandings(cfg))
	s.Router.POST("/api/v1/admin/bind", handlers.AdminBind(cfg, gormOrNil(database)))
	s.Router.POST("/api/v1/admin/unbind", handlers.AdminUnbind(cfg, gormOrNil(database)))

	mpAuth := s.Router.Group("/api/v1/mp/auth")
	mpAuth.POST("/login", handlers.MpAuthLogin(cfg, gormOrNil(database)))
	mpAuthAuth := mpAuth.Group("")
	mpAuthAuth.Use(handlers.MpAuthRequired(gormOrNil(database)))
	mpAuthAuth.GET("/me", handlers.MpAuthMe(gormOrNil(database)))
	mpAuthAuth.POST("/profile", handlers.MpAuthUpdateProfile(gormOrNil(database)))
	mpAuthAuth.POST("/avatar", handlers.MpAuthUploadAvatar(cfg.StaticDir, gormOrNil(database)))
	mpAuthAuth.POST("/bind_device", handlers.MpAuthBindDevice(gormOrNil(database)))
	mpAuthAuth.GET("/prefs", handlers.MpPrefsGet(gormOrNil(database), s.TeamCache))
	mpAuthAuth.PUT("/prefs", handlers.MpPrefsUpdate(gormOrNil(database), s.TeamCache))
	mpAuthAuth.POST("/logout", handlers.MpAuthLogout(gormOrNil(database)))

	s.Router.POST("/api/v1/pay/wechat/jsapi/prepay", handlers.WechatPayJSAPIPrepay(cfg))
	s.Router.GET("/api/v1/pay/wechat/order/:out_trade_no", handlers.WechatPayQueryOrder(cfg))
	s.Router.POST("/api/v1/pay/wechat/notify", handlers.WechatPayNotify(cfg))

	s.Router.GET("/api/v1/shop/categories", handlers.WechatShopCategories(cfg))
	s.Router.GET("/api/v1/shop/categories/:id/products", handlers.WechatShopCategoryProductIDs(cfg))
	s.Router.GET("/api/v1/shop/products", handlers.WechatShopAllProductIDs(cfg))
	s.Router.GET("/api/v1/shop/products/:id", handlers.WechatShopProductDetail(cfg))

	s.Router.GET("/api/v1/f1/sessions", handlers.F1Sessions(cfg, gormOrNil(database), s.Cache))
	s.Router.GET("/api/v1/f1/sessions/current", handlers.F1SessionsCurrentExplicit(cfg, gormOrNil(database), s.Cache))
	s.Router.GET("/api/v1/f1/sessions/:season/:round/:session_name", handlers.F1SessionsByPath(cfg, gormOrNil(database), s.Cache))
	s.Router.GET("/api/v1/f1/session-meta", handlers.F1SessionMeta(cfg, gormOrNil(database), s.Cache))

	s.Router.GET("/api/v1/telemetry/laps/available", handlers.TelemetryLapsAvailable(gormOrNil(database), s.TeamCache))
	s.Router.GET("/api/v1/telemetry/laps", handlers.TelemetryLaps(gormOrNil(database)))
	s.Router.GET("/api/v1/telemetry/lap_controls", handlers.TelemetryLapControls(gormOrNil(database)))
	s.Router.GET("/api/v1/telemetry/lap_controls_series", handlers.TelemetryLapControlsSeries(gormOrNil(database)))
	s.Router.GET("/api/v1/telemetry/lap_trace", handlers.TelemetryLapTrace(gormOrNil(database)))
	s.Router.GET("/api/v1/telemetry/fastest_lap", handlers.TelemetryFastestLap(gormOrNil(database)))
	s.Router.GET("/api/v1/telemetry/lap_time_boxplot", handlers.TelemetryLapTimeBoxplot(gormOrNil(database)))

	handlers.RegisterCompatPlaceholders(s.Router)

	openf1scheduler.Start(cfg, gormOrNil(database))
	tasks.Start(cfg, gormOrNil(database))

	return s
}

func gormOrNil(database *db.DB) *gorm.DB {
	if database == nil {
		return nil
	}
	return database.Gorm
}
