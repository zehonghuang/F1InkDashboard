package config

import (
	"os"
	"strconv"
	"strings"
)

type MySQLConfig struct {
	Enabled  bool
	Host     string
	Port     int
	User     string
	Password string
	DB       string
	Charset  string
}

type WechatPayConfig struct {
	Enabled bool

	MchID      string
	AppID      string
	NotifyURL  string
	ApiV3Key   string
	ApiToken   string
	SerialNo   string
	PrivateKey string
	KeyPath    string

	PlatformCertPEM string
}

type WechatMiniConfig struct {
	Enabled bool
	AppID   string
	Secret  string
}

type Config struct {
	ListenAddr     string
	StaticDir      string
	UpdateDir      string
	TrustedProxies []string
	LogRequests    bool
	RequireMySQL   bool

	AdminToken string

	MySQL      MySQLConfig
	WechatPay  WechatPayConfig
	WechatMini WechatMiniConfig

	NewsWsEnabled   bool
	NewsIngestToken string

	OpenF1Enabled     bool
	OpenF1Mode        string
	OpenF1IngestToken string

	OpenF1SchedulerEnabled        bool
	OpenF1SchedulerIntervalSec    int
	OpenF1SchedulerGraceMin       int
	OpenF1SchedulerCatchUpEnabled bool
	OpenF1SchedulerCatchUpLimit   int
	OpenF1SchedulerPython         string
	OpenF1SchedulerScript         string
	OpenF1SchedulerMaxReqPerSec   int
	OpenF1SchedulerMaxReqPerMin   int
	OpenF1SchedulerQuiet          bool

	MpNewsSchedulerEnabled   bool
	MpNewsSchedulerDailyHour int
	MpNewsSchedulerKeepHero  int
}

func FromEnv() Config {
	staticDir := getenvTrim("BACKEND_STATIC_DIR", "./static")
	updateDir := getenvTrim("BACKEND_UPDATE_DIR", "")
	if updateDir == "" {
		updateDir = strings.TrimRight(staticDir, "/\\") + string(os.PathSeparator) + "update"
	}

	return Config{
		ListenAddr:        getenvTrim("BACKEND_LISTEN_ADDR", ":8008"),
		StaticDir:         staticDir,
		UpdateDir:         updateDir,
		TrustedProxies:    parseTrustedProxies(os.Getenv("BACKEND_TRUSTED_PROXIES")),
		LogRequests:       getenvBool("BACKEND_LOG_REQUESTS", true),
		RequireMySQL:      getenvBool("BACKEND_REQUIRE_MYSQL", true),
		AdminToken:        getenvTrim("BACKEND_ADMIN_TOKEN", ""),
		MySQL:             mysqlFromEnv(),
		WechatPay:         wechatPayFromEnv(),
		WechatMini:        wechatMiniFromEnv(),
		NewsWsEnabled:     getenvBool("NEWS_WS_ENABLED", false),
		NewsIngestToken:   getenvTrim("NEWS_INGEST_TOKEN", ""),
		OpenF1Enabled:     getenvBool("OPENF1_ENABLED", false),
		OpenF1Mode:        getenvTrim("OPENF1_MODE", "mock"),
		OpenF1IngestToken: getenvTrim("OPENF1_INGEST_TOKEN", ""),

		OpenF1SchedulerEnabled:        getenvBool("OPENF1_SCHEDULER_ENABLED", false),
		OpenF1SchedulerIntervalSec:    getenvInt("OPENF1_SCHEDULER_INTERVAL_SEC", 60),
		OpenF1SchedulerGraceMin:       getenvInt("OPENF1_SCHEDULER_GRACE_MIN", 10),
		OpenF1SchedulerCatchUpEnabled: getenvBool("OPENF1_SCHEDULER_CATCHUP_ENABLED", true),
		OpenF1SchedulerCatchUpLimit:   getenvInt("OPENF1_SCHEDULER_CATCHUP_LIMIT", 20),
		OpenF1SchedulerPython:         getenvTrim("OPENF1_SCHEDULER_PYTHON", "python"),
		OpenF1SchedulerScript:         getenvTrim("OPENF1_SCHEDULER_SCRIPT", "scripts/openf1_sync_all_mysql.py"),
		OpenF1SchedulerMaxReqPerSec:   getenvInt("OPENF1_SCHEDULER_MAX_REQ_PER_SEC", 3),
		OpenF1SchedulerMaxReqPerMin:   getenvInt("OPENF1_SCHEDULER_MAX_REQ_PER_MIN", 30),
		OpenF1SchedulerQuiet:          getenvBool("OPENF1_SCHEDULER_QUIET", true),

		MpNewsSchedulerEnabled:   getenvBool("MP_NEWS_SCHEDULER_ENABLED", false),
		MpNewsSchedulerDailyHour: getenvInt("MP_NEWS_SCHEDULER_DAILY_HOUR", 4),
		MpNewsSchedulerKeepHero:  getenvInt("MP_NEWS_SCHEDULER_KEEP_HERO", 5),
	}
}

func mysqlFromEnv() MySQLConfig {
	host := getenvTrim("TOINC_F1_MYSQL_HOST", "127.0.0.1")
	port := getenvInt("TOINC_F1_MYSQL_PORT", 3306)
	user := getenvTrim("TOINC_F1_MYSQL_USER", "root")
	password := os.Getenv("TOINC_F1_MYSQL_PASSWORD")
	if password == "" {
		password = "123456"
	}
	db := getenvTrim("TOINC_F1_MYSQL_DB", "toinc_F1")
	charset := getenvTrim("TOINC_F1_MYSQL_CHARSET", "utf8mb4")
	enabled := getenvBool("TOINC_F1_MYSQL_ENABLED", false)

	return MySQLConfig{
		Enabled:  enabled,
		Host:     host,
		Port:     port,
		User:     user,
		Password: password,
		DB:       db,
		Charset:  charset,
	}
}

func wechatPayFromEnv() WechatPayConfig {
	return WechatPayConfig{
		Enabled:         getenvBool("WECHATPAY_ENABLED", false),
		MchID:           getenvTrim("WECHATPAY_MCH_ID", ""),
		AppID:           getenvTrim("WECHATPAY_APP_ID", ""),
		NotifyURL:       getenvTrim("WECHATPAY_NOTIFY_URL", ""),
		ApiV3Key:        getenvTrim("WECHATPAY_API_V3_KEY", ""),
		ApiToken:        getenvTrim("WECHATPAY_API_TOKEN", ""),
		SerialNo:        getenvTrim("WECHATPAY_MERCHANT_CERT_SERIAL", ""),
		PrivateKey:      strings.TrimSpace(os.Getenv("WECHATPAY_MERCHANT_PRIVATE_KEY_PEM")),
		KeyPath:         getenvTrim("WECHATPAY_MERCHANT_PRIVATE_KEY_PATH", ""),
		PlatformCertPEM: strings.TrimSpace(os.Getenv("WECHATPAY_PLATFORM_CERT_PEM")),
	}
}

func wechatMiniFromEnv() WechatMiniConfig {
	return WechatMiniConfig{
		Enabled: getenvBool("WECHAT_MINI_ENABLED", false),
		AppID:   getenvTrim("WECHAT_MINI_APP_ID", ""),
		Secret:  getenvTrim("WECHAT_MINI_SECRET", ""),
	}
}

func parseTrustedProxies(raw string) []string {
	s := strings.TrimSpace(raw)
	if s == "" {
		return []string{"127.0.0.1", "::1"}
	}
	if strings.EqualFold(s, "all") {
		return nil
	}
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		out = append(out, p)
	}
	return out
}

func getenvTrim(key, def string) string {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return def
	}
	return v
}

func getenvInt(key string, def int) int {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return def
	}
	return n
}

func getenvBool(key string, def bool) bool {
	v := strings.TrimSpace(strings.ToLower(os.Getenv(key)))
	if v == "" {
		return def
	}
	switch v {
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	default:
		return def
	}
}
