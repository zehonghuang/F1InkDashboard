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

type Config struct {
	ListenAddr     string
	StaticDir      string
	TrustedProxies []string
	LogRequests    bool
	RequireMySQL   bool

	AdminToken    string
	InternalToken string

	MySQL MySQLConfig

	NewsWsEnabled   bool
	NewsIngestToken string

	OpenF1Enabled     bool
	OpenF1Mode        string
	OpenF1IngestToken string

	F1LiveTimingEnabled                bool
	F1LiveTimingGraphQLEndpoint        string
	F1LiveTimingPollIntervalMS         int
	F1LiveTimingRequestTimeoutMS       int
	F1LiveTimingScheduleEnabled        bool
	F1LiveTimingScheduleStartBeforeMin int
	F1LiveTimingScheduleStopAfterMin   int
	F1LiveTimingScheduleIntervalSec    int

	MotorsportLiveEnabled                bool
	MotorsportLiveWSURL                  string
	MotorsportLiveOrigin                 string
	MotorsportLiveUserAgent              string
	MotorsportLiveRecentLimit            int
	MotorsportLiveConnectBeforeMin       int
	MotorsportLiveReconnectIntervalSec   int
	MotorsportLiveScheduleEnabled        bool
	MotorsportLiveScheduleStartBeforeMin int
	MotorsportLiveScheduleStopAfterMin   int
	MotorsportLiveScheduleIntervalSec    int
}

func FromEnv() Config {
	staticDir := getenvTrim("WS_SERVER_STATIC_DIR", "./static")
	return Config{
		ListenAddr:        getenvTrim("WS_SERVER_LISTEN_ADDR", ":8009"),
		StaticDir:         staticDir,
		TrustedProxies:    parseTrustedProxies(os.Getenv("WS_SERVER_TRUSTED_PROXIES")),
		LogRequests:       getenvBool("WS_SERVER_LOG_REQUESTS", true),
		RequireMySQL:      getenvBool("WS_SERVER_REQUIRE_MYSQL", true),
		AdminToken:        getenvTrim("BACKEND_ADMIN_TOKEN", ""),
		InternalToken:     getenvTrim("WS_SERVER_INTERNAL_TOKEN", ""),
		MySQL:             mysqlFromEnv(),
		NewsWsEnabled:     getenvBool("NEWS_WS_ENABLED", false),
		NewsIngestToken:   getenvTrim("NEWS_INGEST_TOKEN", ""),
		OpenF1Enabled:     getenvBool("OPENF1_ENABLED", false),
		OpenF1Mode:        getenvTrim("OPENF1_MODE", "mock"),
		OpenF1IngestToken: getenvTrim("OPENF1_INGEST_TOKEN", ""),

		F1LiveTimingEnabled:                getenvBool("F1_LIVE_TIMING_ENABLED", true),
		F1LiveTimingGraphQLEndpoint:        getenvTrim("F1_LIVE_TIMING_GRAPHQL_ENDPOINT", "http://localhost:10457/api/graphql"),
		F1LiveTimingPollIntervalMS:         getenvInt("F1_LIVE_TIMING_POLL_INTERVAL_MS", 100),
		F1LiveTimingRequestTimeoutMS:       getenvInt("F1_LIVE_TIMING_REQUEST_TIMEOUT_MS", 2000),
		F1LiveTimingScheduleEnabled:        getenvBool("F1_LIVE_TIMING_SCHEDULE_ENABLED", true),
		F1LiveTimingScheduleStartBeforeMin: getenvInt("F1_LIVE_TIMING_SCHEDULE_START_BEFORE_MIN", 30),
		F1LiveTimingScheduleStopAfterMin:   getenvInt("F1_LIVE_TIMING_SCHEDULE_STOP_AFTER_MIN", 60),
		F1LiveTimingScheduleIntervalSec:    getenvInt("F1_LIVE_TIMING_SCHEDULE_INTERVAL_SEC", 30),

		MotorsportLiveEnabled:                getenvBool("MOTORSPORT_LIVE_ENABLED", true),
		MotorsportLiveWSURL:                  getenvTrim("MOTORSPORT_LIVE_WS_URL", "wss://livetiming.motorsport.com:8080/782178-full/"),
		MotorsportLiveOrigin:                 getenvTrim("MOTORSPORT_LIVE_ORIGIN", "https://www.motorsport.com"),
		MotorsportLiveUserAgent:              getenvTrim("MOTORSPORT_LIVE_USER_AGENT", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36"),
		MotorsportLiveRecentLimit:            getenvInt("MOTORSPORT_LIVE_RECENT_LIMIT", 20),
		MotorsportLiveConnectBeforeMin:       getenvInt("MOTORSPORT_LIVE_CONNECT_BEFORE_MIN", 30),
		MotorsportLiveReconnectIntervalSec:   getenvInt("MOTORSPORT_LIVE_RECONNECT_INTERVAL_SEC", 120),
		MotorsportLiveScheduleEnabled:        getenvBool("MOTORSPORT_LIVE_SCHEDULE_ENABLED", true),
		MotorsportLiveScheduleStartBeforeMin: getenvInt("MOTORSPORT_LIVE_SCHEDULE_START_BEFORE_MIN", 30),
		MotorsportLiveScheduleStopAfterMin:   getenvInt("MOTORSPORT_LIVE_SCHEDULE_STOP_AFTER_MIN", 60),
		MotorsportLiveScheduleIntervalSec:    getenvInt("MOTORSPORT_LIVE_SCHEDULE_INTERVAL_SEC", 30),
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
