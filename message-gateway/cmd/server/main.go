package main

import (
	"log"
	"os"
	"strings"

	"github.com/joho/godotenv"
	"msg-gateway/internal/config"
	"msg-gateway/internal/db"
	"msg-gateway/internal/httpserver"
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
	if err := s.Router.Run(cfg.ListenAddr); err != nil {
		log.Fatalf("listen failed: %v", err)
	}
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

	log.Printf("startup env WECHAT_SHOP_ENABLED=%s WECHAT_SHOP_APP_ID=%s XHS_ENABLED=%s XHS_APP_ID=%s",
		mk("WECHAT_SHOP_ENABLED"),
		mk("WECHAT_SHOP_APP_ID"),
		mk("XHS_ENABLED"),
		mk("XHS_APP_ID"),
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
		if len(missingWS) > 0 {
			log.Fatalf("startup config invalid: missing env %s (set WECHAT_SHOP_ENABLED=0 to disable)", strings.Join(missingWS, ","))
		}
	}

	if cfg.Xiaohongshu.Enabled {
		missingX := make([]string, 0, 4)
		reqX := func(key string) {
			v, ok := os.LookupEnv(key)
			if !ok || strings.TrimSpace(v) == "" {
				missingX = append(missingX, key)
			}
		}
		reqX("XHS_APP_ID")
		reqX("XHS_APP_SECRET")
		if len(missingX) > 0 {
			log.Fatalf("startup config invalid: missing env %s (set XHS_ENABLED=0 to disable)", strings.Join(missingX, ","))
		}
	}
}
