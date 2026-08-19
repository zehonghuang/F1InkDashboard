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

	"msg-gateway/internal/config"
	"msg-gateway/internal/db"
	"msg-gateway/internal/httpserver"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

func main() {
	loadEnvFiles()
	cfg := config.FromEnv()
	logStartupConfig(cfg)
	validateStartupConfig(cfg)

	database, err := db.Connect(cfg.MySQL)
	if err != nil {
		log.Fatalf("mysql connect failed: %v", err)
	}

	s := httpserver.New(cfg, database)

	srv := &http.Server{
		Addr:    cfg.ListenAddr,
		Handler: s.Router,
	}
	gin.DefaultWriter = log.Writer()
	gin.DefaultErrorWriter = log.Writer()

	errCh := make(chan error, 1)
	go func() {
		log.Printf("http server listening on %s", cfg.ListenAddr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			errCh <- err
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	select {
	case err := <-errCh:
		log.Printf("http server error: %v", err)
	case sig := <-quit:
		log.Printf("received signal: %s, shutting down", sig)
	}

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer shutdownCancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("http server shutdown failed: %v", err)
	}

	s.Close()
	log.Printf("graceful shutdown complete")
}

func loadEnvFiles() {
	for _, name := range []string{".env.local", ".env"} {
		if err := godotenv.Overload(name); err == nil {
			log.Printf("loaded env file: %s", name)
		}
	}
}

func logStartupConfig(cfg config.Config) {
	log.Printf("startup listen_addr=%s", cfg.ListenAddr)

	mk := func(key string) string {
		v, ok := os.LookupEnv(key)
		if !ok || strings.TrimSpace(v) == "" {
			return "missing"
		}
		return "set"
	}

	log.Printf("startup env MSG_GATEWAY_LISTEN_ADDR=%s MSG_GATEWAY_ADMIN_TOKEN=%s",
		mk("MSG_GATEWAY_LISTEN_ADDR"),
		mk("MSG_GATEWAY_ADMIN_TOKEN"),
	)

	log.Printf("startup env MSG_GATEWAY_MYSQL_ENABLED=%s MSG_GATEWAY_MYSQL_HOST=%s MSG_GATEWAY_MYSQL_PORT=%s MSG_GATEWAY_MYSQL_USER=%s MSG_GATEWAY_MYSQL_DB=%s",
		mk("MSG_GATEWAY_MYSQL_ENABLED"),
		mk("MSG_GATEWAY_MYSQL_HOST"),
		mk("MSG_GATEWAY_MYSQL_PORT"),
		mk("MSG_GATEWAY_MYSQL_USER"),
		mk("MSG_GATEWAY_MYSQL_DB"),
	)

	log.Printf("startup env WECHAT_SHOP_ENABLED=%s WECHAT_SHOP_APP_ID=%s",
		mk("WECHAT_SHOP_ENABLED"),
		mk("WECHAT_SHOP_APP_ID"),
	)

	if !cfg.MySQL.Enabled {
		log.Printf("startup mysql disabled: set MSG_GATEWAY_MYSQL_ENABLED=1")
		return
	}
	log.Printf("startup mysql enabled host=%s port=%d user=%s db=%s charset=%s",
		cfg.MySQL.Host, cfg.MySQL.Port, cfg.MySQL.User, cfg.MySQL.DB, cfg.MySQL.Charset)
}

func validateStartupConfig(cfg config.Config) {
	if !cfg.RequireMySQL {
		return
	}
	missing := make([]string, 0, 8)
	req := func(key string) {
		v, ok := os.LookupEnv(key)
		if !ok || strings.TrimSpace(v) == "" {
			missing = append(missing, key)
		}
	}
	req("MSG_GATEWAY_MYSQL_ENABLED")
	req("MSG_GATEWAY_MYSQL_HOST")
	req("MSG_GATEWAY_MYSQL_PORT")
	req("MSG_GATEWAY_MYSQL_USER")
	req("MSG_GATEWAY_MYSQL_PASSWORD")
	req("MSG_GATEWAY_MYSQL_DB")

	if len(missing) > 0 {
		log.Fatalf("startup config invalid: missing env %s (set MSG_GATEWAY_REQUIRE_MYSQL=0 to allow boot without mysql)",
			strings.Join(missing, ","))
	}
	if !cfg.MySQL.Enabled {
		log.Fatalf("startup config invalid: mysql disabled (set MSG_GATEWAY_MYSQL_ENABLED=1, or set MSG_GATEWAY_REQUIRE_MYSQL=0)")
	}

	if cfg.WechatShop.Enabled {
		missingWS := make([]string, 0, 4)
		reqWS := func(key string) {
			v, ok := os.LookupEnv(key)
			if !ok || strings.TrimSpace(v) == "" {
				missingWS = append(missingWS, key)
			}
		}
		reqWS("WECHAT_SHOP_APP_ID")
		reqWS("WECHAT_SHOP_SECRET")
		reqWS("WECHAT_SHOP_NOTIFY_TOKEN")
		if len(missingWS) > 0 {
			log.Fatalf("startup config invalid: missing env %s (set WECHAT_SHOP_ENABLED=0 to disable)", strings.Join(missingWS, ","))
		}
	}
}
