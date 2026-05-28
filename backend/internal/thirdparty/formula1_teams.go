package thirdparty

import (
	"context"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"
)

var (
	f1TeamsLogosMu     sync.Mutex
	f1TeamsLogosAt     time.Time
	f1TeamsLogosByKey  map[string]string
	f1TeamsLogosReLogo = regexp.MustCompile(`https://media\.formula1\.com/image/upload[^"'\\s]+/common/f1/\\d{4}/([^/]+)/[^"'\\s]+logowhite\\.webp`)
)

func EnsureFormula1TeamLogo(staticDir string, teamName string) string {
	if strings.TrimSpace(staticDir) == "" {
		return ""
	}
	key := normalizeTeamKey(teamName)
	if key == "" {
		return ""
	}
	dst := filepath.Join(staticDir, "teams", key+".webp")
	if fileExists(dst) {
		return "/static/teams/" + key + ".webp"
	}

	f1TeamsLogosMu.Lock()
	defer f1TeamsLogosMu.Unlock()

	if fileExists(dst) {
		return "/static/teams/" + key + ".webp"
	}

	if f1TeamsLogosByKey == nil || time.Since(f1TeamsLogosAt) >= 24*time.Hour {
		m, err := fetchFormula1TeamLogos(context.Background())
		if err == nil && len(m) > 0 {
			f1TeamsLogosByKey = m
			f1TeamsLogosAt = time.Now()
		}
	}
	src := ""
	if f1TeamsLogosByKey != nil {
		src = strings.TrimSpace(f1TeamsLogosByKey[key])
	}
	if src == "" {
		return ""
	}
	if err := DownloadFile(context.Background(), src, dst); err != nil {
		return ""
	}
	if fileExists(dst) {
		return "/static/teams/" + key + ".webp"
	}
	return ""
}

func formula1TeamLogosCached(ctx context.Context) map[string]string {
	f1TeamsLogosMu.Lock()
	defer f1TeamsLogosMu.Unlock()

	if f1TeamsLogosByKey != nil && time.Since(f1TeamsLogosAt) < 24*time.Hour {
		return f1TeamsLogosByKey
	}

	m, err := fetchFormula1TeamLogos(ctx)
	if err == nil && len(m) > 0 {
		f1TeamsLogosByKey = m
		f1TeamsLogosAt = time.Now()
		return f1TeamsLogosByKey
	}

	return f1TeamsLogosByKey
}

func fetchFormula1TeamLogos(ctx context.Context) (map[string]string, error) {
	html, err := GetText(ctx, "https://www.formula1.com/en/teams")
	if err != nil {
		return nil, err
	}
	m := map[string]string{}
	matches := f1TeamsLogosReLogo.FindAllStringSubmatch(html, -1)
	for _, mm := range matches {
		if len(mm) < 2 {
			continue
		}
		key := strings.ToLower(strings.TrimSpace(mm[1]))
		url := strings.TrimSpace(mm[0])
		if key == "" || url == "" {
			continue
		}
		if _, ok := m[key]; ok {
			continue
		}
		m[key] = url
	}
	return m, nil
}

func normalizeTeamKey(s string) string {
	v := strings.ToLower(strings.TrimSpace(s))
	if v == "" {
		return ""
	}
	out := make([]byte, 0, len(v))
	for i := 0; i < len(v); i++ {
		c := v[i]
		isAZ := c >= 'a' && c <= 'z'
		is09 := c >= '0' && c <= '9'
		if isAZ || is09 {
			out = append(out, c)
		}
	}
	return string(out)
}

func fileExists(p string) bool {
	st, err := os.Stat(p)
	if err != nil {
		return false
	}
	return st.Mode().IsRegular()
}
