package httpserver

import (
	"log"

	"msg-gateway/internal/config"
	"msg-gateway/internal/db"
	"msg-gateway/internal/httpserver/handlers"
	"msg-gateway/internal/message"
	"msg-gateway/internal/model"
	"msg-gateway/internal/platform"
	"msg-gateway/internal/wechatshop"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type Server struct {
	Router *gin.Engine
	DB     *db.DB
	Config config.Config
	AppCtx *handlers.AppContext
}

func New(cfg config.Config, database *db.DB) *Server {
	gormDB := gormOrNil(database)
	autoMigrate(gormDB)

	msgSvc := message.NewService(gormDB)
	msgSvc.StartIngestWorkers(0)

	var wsCli *wechatshop.Client
	if cfg.WechatShop.Enabled {
		c, err := wechatshop.NewClient(cfg.WechatShop)
		if err != nil {
			log.Printf("[server] wechatshop client init skipped: %v", err)
		} else {
			wsCli = c
			msgSvc.RegisterClient(model.PlatformWechatShop, platform.Client(wsCli))
			log.Printf("[server] wechatshop client registered")
		}
	}

	appCtx := &handlers.AppContext{
		Cfg:           cfg,
		MessageSvc:    msgSvc,
		WechatShopCli: wsCli,
	}

	s := &Server{
		Router: gin.New(),
		DB:     database,
		Config: cfg,
		AppCtx: appCtx,
	}

	s.Router.Use(gin.Recovery())
	_ = s.Router.SetTrustedProxies(cfg.TrustedProxies)
	s.Router.Use(handlers.RequestLogger(cfg.LogRequests))

	s.registerRoutes()
	return s
}

func (s *Server) Close() {
	if s.AppCtx != nil && s.AppCtx.MessageSvc != nil {
		s.AppCtx.MessageSvc.StopIngestWorkers()
	}
}

func (s *Server) registerRoutes() {
	r := s.Router
	app := s.AppCtx

	r.GET("/health", handlers.Health())

	r.GET("/webhook/wechatshop", handlers.WechatShopWebhookVerify(app))
	r.POST("/webhook/wechatshop", handlers.WechatShopWebhook(app))

	admin := r.Group("/api/v1/admin")
	admin.Use(handlers.AdminRequired(s.Config))
	{
		admin.POST("/message/send", handlers.SendMessage(app))
		admin.GET("/conversations", handlers.ListConversations(app))
		admin.GET("/conversations/:conversation_id/messages", handlers.ListMessages(app))
	}
}

func autoMigrate(g *gorm.DB) {
	if g == nil {
		return
	}
	err := g.AutoMigrate(
		&model.PlatformUser{},
		&model.Conversation{},
		&model.Message{},
		&model.PlatformEvent{},
	)
	if err != nil {
		log.Printf("[server] auto migrate failed: %v", err)
	} else {
		log.Printf("[server] auto migrate completed")
	}
}

func gormOrNil(database *db.DB) *gorm.DB {
	if database == nil {
		return nil
	}
	return database.Gorm
}
