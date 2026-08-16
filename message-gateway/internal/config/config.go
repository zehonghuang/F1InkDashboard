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

type WechatShopConfig struct {
	Enabled     bool
	AppID       string
	Secret      string
	ApiToken    string
	NotifyToken string
	AESKey      string
}

type XiaohongshuConfig struct {
	Enabled     bool
	AppID       string
	AppSecret   string
	AccessToken string
	NotifyToken string
}

type AdminConfig struct {
	Token string
}

type Config struct {
	ListenAddr     string
	TrustedProxies []string
	LogRequests    bool
	RequireMySQL   bool

	Admin AdminConfig

	MySQL       MySQLConfig
	WechatShop  WechatShopConfig
	Xiaohongshu XiaohongshuConfig
}

func FromEnv() Config {
	return Config{
		ListenAddr:     getenvTrim("MSG_GATEWAY_LISTEN_ADDR", ":8009"),
		TrustedProxies: parseTrustedProxies(os.Getenv("MSG_GATEWAY_TRUSTED_PROXIES")),
		LogRequests:    getenvBool("MSG_GATEWAY_LOG_REQUESTS", true),
		RequireMySQL:   getenvBool("MSG_GATEWAY_REQUIRE_MYSQL", true),
		Admin: AdminConfig{
			Token: getenvTrim("MSG_GATEWAY_ADMIN_TOKEN", ""),
		},
		MySQL:       mysqlFromEnv(),
		WechatShop:  wechatShopFromEnv(),
		Xiaohongshu: xiaohongshuFromEnv(),
	}
}

func mysqlFromEnv() MySQLConfig {
	host := getenvTrim("MSG_GATEWAY_MYSQL_HOST", "127.0.0.1")
	port := getenvInt("MSG_GATEWAY_MYSQL_PORT", 3306)
	user := getenvTrim("MSG_GATEWAY_MYSQL_USER", "root")
	password := os.Getenv("MSG_GATEWAY_MYSQL_PASSWORD")
	if password == "" {
		password = "123456"
	}
	db := getenvTrim("MSG_GATEWAY_MYSQL_DB", "msg_gateway")
	charset := getenvTrim("MSG_GATEWAY_MYSQL_CHARSET", "utf8mb4")
	enabled := getenvBool("MSG_GATEWAY_MYSQL_ENABLED", false)

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

func wechatShopFromEnv() WechatShopConfig {
	return WechatShopConfig{
		Enabled:     getenvBool("WECHAT_SHOP_ENABLED", false),
		AppID:       getenvTrim("WECHAT_SHOP_APP_ID", ""),
		Secret:      getenvTrim("WECHAT_SHOP_SECRET", ""),
		ApiToken:    getenvTrim("WECHAT_SHOP_API_TOKEN", ""),
		NotifyToken: getenvTrim("WECHAT_SHOP_NOTIFY_TOKEN", ""),
		AESKey:      getenvTrim("WECHAT_SHOP_AES_KEY", ""),
	}
}

func xiaohongshuFromEnv() XiaohongshuConfig {
	return XiaohongshuConfig{
		Enabled:     getenvBool("XHS_ENABLED", false),
		AppID:       getenvTrim("XHS_APP_ID", ""),
		AppSecret:   getenvTrim("XHS_APP_SECRET", ""),
		AccessToken: getenvTrim("XHS_ACCESS_TOKEN", ""),
		NotifyToken: getenvTrim("XHS_NOTIFY_TOKEN", ""),
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
