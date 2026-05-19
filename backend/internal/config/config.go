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

type Config struct {
	ListenAddr     string
	StaticDir      string
	UpdateDir      string
	TrustedProxies []string
	LogRequests    bool

	MySQL     MySQLConfig
	WechatPay WechatPayConfig

	NewsWsEnabled   bool
	NewsIngestToken string

	OpenF1Enabled     bool
	OpenF1Mode        string
	OpenF1IngestToken string
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
		MySQL:             mysqlFromEnv(),
		WechatPay:         wechatPayFromEnv(),
		NewsWsEnabled:     getenvBool("NEWS_WS_ENABLED", false),
		NewsIngestToken:   getenvTrim("NEWS_INGEST_TOKEN", ""),
		OpenF1Enabled:     getenvBool("OPENF1_ENABLED", false),
		OpenF1Mode:        getenvTrim("OPENF1_MODE", "mock"),
		OpenF1IngestToken: getenvTrim("OPENF1_INGEST_TOKEN", ""),
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
