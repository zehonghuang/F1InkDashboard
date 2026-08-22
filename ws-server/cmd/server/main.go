package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"f1ink_ws_server/internal/config"
	"f1ink_ws_server/internal/db"
	"f1ink_ws_server/internal/f1livetiming"
	"f1ink_ws_server/internal/httpserver/handlers"
	"f1ink_ws_server/internal/model"
	"f1ink_ws_server/internal/motorsportlive"
	"f1ink_ws_server/internal/util"
	"f1ink_ws_server/internal/ws"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

func main() {
	if _, err := os.Stat(".env"); err == nil {
		_ = godotenv.Load()
	}

	cfg := config.FromEnv()

	database, err := db.Connect(cfg.MySQL)
	if err != nil && cfg.RequireMySQL {
		log.Fatalf("mysql connect required: %v", err)
	}

	shared := &handlers.SharedState{
		HubEcho:           ws.NewHub(),
		HubNews:           ws.NewHub(),
		HubOpenF1FW:       ws.NewHub(),
		HubOpenF1Raw:      ws.NewHub(),
		HubF1LiveTiming:   ws.NewHub(),
		HubMotorsportLive: ws.NewHub(),
	}

	var gormDB interface{}
	if database != nil {
		gormDB = database.Gorm
		shared.F1LiveTimingManager = f1livetiming.New(cfg, database.Gorm, shared.HubF1LiveTiming)
		shared.MotorsportLiveManager = motorsportlive.New(cfg, database.Gorm, shared.HubMotorsportLive)
	} else {
		shared.F1LiveTimingManager = f1livetiming.New(cfg, nil, shared.HubF1LiveTiming)
		shared.MotorsportLiveManager = motorsportlive.New(cfg, nil, shared.HubMotorsportLive)
	}
	_ = gormDB

	if shared.F1LiveTimingManager != nil {
		shared.F1LiveTimingManager.Start()
	}
	if shared.MotorsportLiveManager != nil {
		shared.MotorsportLiveManager.Start()
	}

	if cfg.LogRequests {
		gin.SetMode(gin.DebugMode)
	} else {
		gin.SetMode(gin.ReleaseMode)
	}

	router := gin.New()
	router.Use(gin.Recovery())
	router.Use(requestLogger(cfg))
	_ = handlers.InternalAuthMiddleware

	if len(cfg.TrustedProxies) > 0 {
		_ = router.SetTrustedProxies(cfg.TrustedProxies)
	} else {
		_ = router.SetTrustedProxies(nil)
	}

	registerRoutes(router, cfg, shared)

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	srv := &http.Server{
		Addr:              cfg.ListenAddr,
		Handler:           router,
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		log.Printf("ws-server listening on %s mysql=%v f1live=%v motorsport=%v news=%v openf1=%v",
			srv.Addr,
			cfg.MySQL.Enabled,
			cfg.F1LiveTimingEnabled,
			cfg.MotorsportLiveEnabled,
			cfg.NewsWsEnabled,
			cfg.OpenF1Enabled,
		)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("listen error: %v", err)
		}
	}()

	<-ctx.Done()
	stop()

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	if shared.MotorsportLiveManager != nil {
		shared.MotorsportLiveManager.Stop()
	}
	if shared.F1LiveTimingManager != nil {
		shared.F1LiveTimingManager.Stop()
	}

	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("ws-server shutdown error: %v", err)
	}
	log.Printf("ws-server stopped")
}

func requestLogger(cfg config.Config) gin.HandlerFunc {
	if !cfg.LogRequests {
		return func(c *gin.Context) { c.Next() }
	}
	return func(c *gin.Context) {
		start := time.Now()
		path := c.Request.URL.Path
		raw := c.Request.URL.RawQuery
		c.Next()
		latency := time.Since(start)
		clientIP := c.ClientIP()
		method := c.Request.Method
		code := c.Writer.Status()
		bodySize := c.Writer.Size()
		errMsg := c.Errors.ByType(gin.ErrorTypePrivate).String()
		if raw != "" {
			path = path + "?" + raw
		}
		log.Printf("[WS] %s | %3d | %12v | %15s | %-7s %s | %d%s",
			time.Now().Format("2006/01/02 15:04:05"),
			code,
			latency,
			clientIP,
			method,
			path,
			bodySize,
			condString(errMsg != "", " | "+errMsg, ""),
		)
	}
}

func condString(cond bool, a, b string) string {
	if cond {
		return a
	}
	return b
}

func registerRoutes(r *gin.Engine, cfg config.Config, shared *handlers.SharedState) {
	r.GET("/", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"ok":   true,
			"app":  "f1ink_ws_server",
			"time": util.NowUTCISO8601(),
		})
	})
	r.GET("/healthz", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})

	apiV1 := r.Group("/api/v1")
	wsGroup := r.Group("/ws")

	apiV1.GET("/admin/ws/status", func(c *gin.Context) {
		if !adminTokenHeader(c, cfg.AdminToken) {
			return
		}
		c.JSON(http.StatusOK, model.WsStatusResponse{Ok: true, Clients: shared.HubEcho.Count()})
	})
	apiV1.POST("/admin/ws/broadcast/text", func(c *gin.Context) {
		if !adminTokenHeader(c, cfg.AdminToken) {
			return
		}
		var body struct {
			Message string `json:"message"`
		}
		if err := c.BindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: err.Error()})
			return
		}
		sent := shared.HubEcho.BroadcastText(body.Message)
		c.JSON(http.StatusOK, model.WsBroadcastResponse{Ok: true, Sent: sent})
	})
	apiV1.POST("/admin/ws/broadcast/json", func(c *gin.Context) {
		if !adminTokenHeader(c, cfg.AdminToken) {
			return
		}
		var payload any
		if err := c.BindJSON(&payload); err != nil {
			c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: err.Error()})
			return
		}
		sent := shared.HubEcho.BroadcastJSON(payload)
		c.JSON(http.StatusOK, model.WsBroadcastResponse{Ok: true, Sent: sent})
	})

	wsGroup.GET("", handlers.HandleWS(shared.HubEcho, cfg))
	wsGroup.GET("/", handlers.HandleWS(shared.HubEcho, cfg))
	wsGroup.GET("/echo", handlers.HandleWSEcho(shared.HubEcho, cfg))
	wsGroup.GET("/admin/status", handlers.WsEchoStatus(shared.HubEcho, cfg))
	wsGroup.POST("/admin/broadcast/text", handlers.WsBroadcastText(shared.HubEcho, cfg))
	wsGroup.POST("/admin/broadcast/json", handlers.WsBroadcastJSON(shared.HubEcho, cfg))

	apiV1.GET("/ws/status", func(c *gin.Context) {
		if !adminTokenHeader(c, cfg.AdminToken) {
			return
		}
		c.JSON(http.StatusOK, model.WsStatusResponse{Ok: true, Clients: shared.HubEcho.Count()})
	})
	apiV1.POST("/ws/broadcast/text", func(c *gin.Context) {
		if !adminTokenHeader(c, cfg.AdminToken) {
			return
		}
		var body struct {
			Message string `json:"message"`
		}
		if err := c.BindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: err.Error()})
			return
		}
		sent := shared.HubEcho.BroadcastText(body.Message)
		c.JSON(http.StatusOK, model.WsBroadcastResponse{Ok: true, Sent: sent})
	})
	apiV1.POST("/ws/broadcast/json", func(c *gin.Context) {
		if !adminTokenHeader(c, cfg.AdminToken) {
			return
		}
		var payload any
		if err := c.BindJSON(&payload); err != nil {
			c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: err.Error()})
			return
		}
		sent := shared.HubEcho.BroadcastJSON(payload)
		c.JSON(http.StatusOK, model.WsBroadcastResponse{Ok: true, Sent: sent})
	})

	wsGroup.GET("/news", handlers.HandleWS(shared.HubNews, cfg))
	apiV1.GET("/news/ws/status", handlers.WsNewsStatus(shared.HubNews, cfg))
	apiV1.POST("/news/ws/ingest", handlers.WsNewsIngest(cfg, shared.HubNews))
	apiV1.POST("/news/ingest", handlers.WsNewsIngest(cfg, shared.HubNews))

	wsGroup.GET("/openf1", handlers.HandleWS(shared.HubOpenF1FW, cfg))
	wsGroup.GET("/openf1/fw", handlers.HandleWS(shared.HubOpenF1FW, cfg))
	wsGroup.GET("/openf1/raw", handlers.HandleWS(shared.HubOpenF1Raw, cfg))
	wsGroup.GET("/openf1/raw/*rest", handlers.HandleWS(shared.HubOpenF1Raw, cfg))
	apiV1.GET("/openf1/ws/status", handlers.WsOpenF1Status(shared.HubOpenF1FW, shared.HubOpenF1Raw, cfg))
	apiV1.POST("/openf1/ingest", handlers.WsOpenF1IngestFW(shared.HubOpenF1FW, cfg))
	apiV1.POST("/openf1/ingest/fw", handlers.WsOpenF1IngestFW(shared.HubOpenF1FW, cfg))
	apiV1.POST("/openf1/ingest/raw", handlers.WsOpenF1IngestRaw(shared.HubOpenF1Raw, cfg))
	apiV1.POST("/openf1/ingest-ws", handlers.WsOpenF1IngestRaw(shared.HubOpenF1Raw, cfg))

	wsGroup.GET("/f1/live-timing", handlers.HandleWS(shared.HubF1LiveTiming, cfg))
	wsGroup.GET("/f1/live-timing/", handlers.HandleWS(shared.HubF1LiveTiming, cfg))
	apiV1.GET("/admin/f1/live-timing", handlers.WsF1LiveTimingAdmin(cfg, shared.F1LiveTimingManager))

	wsGroup.GET("/mp/f1/live-timing", handlers.HandleWS(shared.HubF1LiveTiming, cfg))
	wsGroup.GET("/mp/f1/live-timing/", handlers.HandleWS(shared.HubF1LiveTiming, cfg))

	wsGroup.GET("/motorsport/live", handlers.HandleWS(shared.HubMotorsportLive, cfg))
	wsGroup.GET("/motorsport/live/", handlers.HandleWS(shared.HubMotorsportLive, cfg))
	apiV1.GET("/admin/motorsport/live/standings", handlers.WsMotorsportLiveStandings(cfg, shared.MotorsportLiveManager))

	internalGroup := r.Group("/internal")
	handlers.AttachInternalAPI(internalGroup, cfg, shared)
}

func adminTokenHeader(c *gin.Context, adminToken string) bool {
	expected := strings.TrimSpace(adminToken)
	if expected == "" {
		return true
	}
	headerToken := strings.TrimSpace(c.GetHeader("X-Admin-Token"))
	if headerToken == expected {
		return true
	}
	c.JSON(http.StatusUnauthorized, model.ErrorResponse{Ok: false, Error: "unauthorized"})
	return false
}
