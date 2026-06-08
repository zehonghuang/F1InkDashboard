package main

import (
	"log"
	"os"
	"strings"

	"github.com/joho/godotenv"
	"toinc_f1_backend/internal/config"
	"toinc_f1_backend/internal/db"
	"toinc_f1_backend/internal/httpserver"
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
	log.Printf("startup listen_addr=%s static_dir=%s update_dir=%s", cfg.ListenAddr, cfg.StaticDir, cfg.UpdateDir)

	mk := func(key string) string {
		v, ok := os.LookupEnv(key)
		if !ok || strings.TrimSpace(v) == "" {
			return "missing"
		}
		return "set"
	}

	log.Printf("startup env BACKEND_LISTEN_ADDR=%s BACKEND_STATIC_DIR=%s BACKEND_UPDATE_DIR=%s",
		mk("BACKEND_LISTEN_ADDR"),
		mk("BACKEND_STATIC_DIR"),
		mk("BACKEND_UPDATE_DIR"),
	)

	log.Printf("startup env TOINC_F1_MYSQL_ENABLED=%s TOINC_F1_MYSQL_HOST=%s TOINC_F1_MYSQL_PORT=%s TOINC_F1_MYSQL_USER=%s TOINC_F1_MYSQL_PASSWORD=%s TOINC_F1_MYSQL_DB=%s TOINC_F1_MYSQL_CHARSET=%s",
		mk("TOINC_F1_MYSQL_ENABLED"),
		mk("TOINC_F1_MYSQL_HOST"),
		mk("TOINC_F1_MYSQL_PORT"),
		mk("TOINC_F1_MYSQL_USER"),
		mk("TOINC_F1_MYSQL_PASSWORD"),
		mk("TOINC_F1_MYSQL_DB"),
		mk("TOINC_F1_MYSQL_CHARSET"),
	)

	log.Printf("startup env WECHAT_MINI_ENABLED=%s WECHAT_MINI_APP_ID=%s WECHAT_MINI_SECRET=%s",
		mk("WECHAT_MINI_ENABLED"),
		mk("WECHAT_MINI_APP_ID"),
		mk("WECHAT_MINI_SECRET"),
	)

	if !cfg.MySQL.Enabled {
		log.Printf("startup mysql disabled: set TOINC_F1_MYSQL_ENABLED=1, otherwise /api/v1/ui/pages will return mysql_required")
		return
	}

	log.Printf("startup mysql enabled host=%s port=%d user=%s db=%s charset=%s", cfg.MySQL.Host, cfg.MySQL.Port, cfg.MySQL.User, cfg.MySQL.DB, cfg.MySQL.Charset)
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
	req("TOINC_F1_MYSQL_ENABLED")
	req("TOINC_F1_MYSQL_HOST")
	req("TOINC_F1_MYSQL_PORT")
	req("TOINC_F1_MYSQL_USER")
	req("TOINC_F1_MYSQL_PASSWORD")
	req("TOINC_F1_MYSQL_DB")

	if len(missing) > 0 {
		log.Fatalf("startup config invalid: missing env %s (set BACKEND_REQUIRE_MYSQL=0 to allow boot without mysql)", strings.Join(missing, ","))
	}
	if !cfg.MySQL.Enabled {
		log.Fatalf("startup config invalid: mysql disabled (set TOINC_F1_MYSQL_ENABLED=1, or set BACKEND_REQUIRE_MYSQL=0)")
	}

	if cfg.WechatMini.Enabled {
		missingMini := make([]string, 0, 4)
		reqMini := func(key string) {
			v, ok := os.LookupEnv(key)
			if !ok || strings.TrimSpace(v) == "" {
				missingMini = append(missingMini, key)
			}
		}
		reqMini("WECHAT_MINI_APP_ID")
		reqMini("WECHAT_MINI_SECRET")
		if len(missingMini) > 0 {
			log.Fatalf("startup config invalid: missing env %s (set WECHAT_MINI_ENABLED=0 to disable mini-program login)", strings.Join(missingMini, ","))
		}
	}
}
