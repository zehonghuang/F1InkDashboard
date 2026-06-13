package handlers

import (
	"fmt"
	"io"
	"net/http"
	neturl "net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/net/html"
	"toinc_f1_backend/internal/config"
	"toinc_f1_backend/internal/model"
)

var (
	motorsportLiveTimingURLRe = regexp.MustCompile(`https?://www\.motorsport\.com/live-timing/\d+/|/live-timing/\d+/`)
	motorsportTyreLapsRe      = regexp.MustCompile(`(?i)(\d+)L\b`)
	motorsportTyrePitRe       = regexp.MustCompile(`(?i)(\d+)Pit\b`)
)

func AdminMotorsportLiveStandings(cfg config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !adminTokenOK(c, cfg.AdminToken) {
			return
		}

		sourceURL := strings.TrimSpace(c.Query("source_url"))
		if sourceURL == "" {
			sourceURL = "https://www.motorsport.com/f1/live-text/f1-barcelona-gp-live-commentary-and-updates-fp3/1127043/"
		}

		liveTimingURL, err := resolveMotorsportLiveTimingURL(sourceURL)
		if err != nil {
			c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: err.Error()})
			return
		}

		raw, err := fetchMotorsportPage(liveTimingURL)
		if err != nil {
			LogReqError(c, "admin_motorsport_live_standings", "fetch_failed", err)
			c.JSON(http.StatusBadGateway, model.ErrorResponse{Ok: false, Error: "upstream_fetch_failed"})
			return
		}

		status, sessionTitle, rows, err := parseMotorsportLiveTimingHTML(raw)
		if err != nil {
			LogReqError(c, "admin_motorsport_live_standings", "parse_failed", err)
			c.JSON(http.StatusBadGateway, model.ErrorResponse{Ok: false, Error: "upstream_parse_failed"})
			return
		}

		c.JSON(http.StatusOK, model.AdminMotorsportLiveStandingsResponse{
			Ok:            true,
			SourceURL:     sourceURL,
			LiveTimingURL: liveTimingURL,
			Status:        status,
			SessionTitle:  sessionTitle,
			FetchedAtUTC:  time.Now().UTC().Format(time.RFC3339Nano),
			Rows:          rows,
		})
	}
}

func resolveMotorsportLiveTimingURL(sourceURL string) (string, error) {
	u, err := neturl.Parse(sourceURL)
	if err != nil {
		return "", fmt.Errorf("bad_source_url")
	}
	if !isMotorsportHost(u.Hostname()) {
		return "", fmt.Errorf("source_host_not_allowed")
	}

	if strings.Contains(u.Path, "/live-timing/") {
		u.RawQuery = ""
		u.Fragment = ""
		return u.String(), nil
	}

	raw, err := fetchMotorsportPage(u.String())
	if err != nil {
		return "", err
	}
	m := motorsportLiveTimingURLRe.FindString(raw)
	if m == "" {
		return "", fmt.Errorf("live_timing_url_not_found")
	}
	if strings.HasPrefix(m, "http://") || strings.HasPrefix(m, "https://") {
		return m, nil
	}
	base := &neturl.URL{Scheme: u.Scheme, Host: u.Host}
	ref, err := neturl.Parse(m)
	if err != nil {
		return "", fmt.Errorf("live_timing_url_not_found")
	}
	return base.ResolveReference(ref).String(), nil
}

func fetchMotorsportPage(pageURL string) (string, error) {
	u, err := neturl.Parse(pageURL)
	if err != nil {
		return "", err
	}
	if !isMotorsportHost(u.Hostname()) {
		return "", fmt.Errorf("source_host_not_allowed")
	}

	req, err := http.NewRequest(http.MethodGet, pageURL, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")

	client := &http.Client{Timeout: 20 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("http_%d", resp.StatusCode)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	return string(body), nil
}

func parseMotorsportLiveTimingHTML(raw string) (string, string, []model.AdminMotorsportStandingRow, error) {
	doc, err := html.Parse(strings.NewReader(raw))
	if err != nil {
		return "", "", nil, err
	}

	var headings []string
	var table *html.Node
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if table != nil {
			return
		}
		if n.Type == html.ElementNode && n.Data == "table" {
			table = n
			return
		}
		if n.Type == html.ElementNode && isHeadingTag(n.Data) {
			txt := cleanHTMLText(nodeText(n))
			if txt != "" {
				headings = append(headings, txt)
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
			if table != nil {
				return
			}
		}
	}
	walk(doc)

	if table == nil {
		return "", "", nil, fmt.Errorf("standings_table_not_found")
	}

	status := ""
	sessionTitle := ""
	if len(headings) > 0 {
		status = headings[0]
	}
	if len(headings) > 1 {
		sessionTitle = headings[1]
	}

	rows := make([]model.AdminMotorsportStandingRow, 0, 24)
	for tr := table.FirstChild; tr != nil; tr = nextNode(tr, table) {
		if tr.Type != html.ElementNode || tr.Data != "tr" {
			continue
		}
		cells := tableRowCells(tr)
		if len(cells) < 6 {
			continue
		}
		if isStandingsHeaderRow(cells) {
			continue
		}
		row, ok := parseStandingsRow(cells)
		if !ok {
			continue
		}
		rows = append(rows, row)
	}

	if len(rows) == 0 {
		return status, sessionTitle, nil, fmt.Errorf("standings_rows_not_found")
	}
	return status, sessionTitle, rows, nil
}

func isMotorsportHost(host string) bool {
	host = strings.ToLower(strings.TrimSpace(host))
	return host == "motorsport.com" || host == "www.motorsport.com"
}

func isHeadingTag(tag string) bool {
	switch tag {
	case "h1", "h2", "h3", "h4":
		return true
	default:
		return false
	}
}

func nodeText(n *html.Node) string {
	if n == nil {
		return ""
	}
	if n.Type == html.TextNode {
		return n.Data
	}
	var b strings.Builder
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		b.WriteString(nodeText(c))
		b.WriteByte(' ')
	}
	return b.String()
}

func cleanHTMLText(s string) string {
	return strings.Join(strings.Fields(strings.TrimSpace(s)), " ")
}

func nextNode(n *html.Node, stop *html.Node) *html.Node {
	if n.FirstChild != nil {
		return n.FirstChild
	}
	for n != nil {
		if n == stop {
			return nil
		}
		if n.NextSibling != nil {
			return n.NextSibling
		}
		n = n.Parent
	}
	return nil
}

func tableRowCells(tr *html.Node) []string {
	out := []string{}
	for c := tr.FirstChild; c != nil; c = c.NextSibling {
		if c.Type != html.ElementNode {
			continue
		}
		if c.Data != "td" && c.Data != "th" {
			continue
		}
		out = append(out, cleanHTMLText(nodeText(c)))
	}
	return out
}

func isStandingsHeaderRow(cells []string) bool {
	line := strings.ToLower(strings.Join(cells, " "))
	return strings.Contains(line, "driver") && strings.Contains(line, "team")
}

func parseStandingsRow(cells []string) (model.AdminMotorsportStandingRow, bool) {
	if len(cells) < 6 {
		return model.AdminMotorsportStandingRow{}, false
	}

	offset := 0
	if len(cells) >= 7 {
		offset = 1
	}

	pos, err := strconv.Atoi(strings.TrimSpace(cells[0]))
	if err != nil || pos <= 0 {
		return model.AdminMotorsportStandingRow{}, false
	}

	driver := ""
	team := ""
	gap := ""
	bestTime := ""
	tyreRaw := ""

	if len(cells) >= 7 {
		driver = strings.TrimSpace(cells[1+offset])
		team = strings.TrimSpace(cells[2+offset])
		gap = strings.TrimSpace(cells[3+offset])
		bestTime = strings.TrimSpace(cells[4+offset])
		tyreRaw = strings.TrimSpace(cells[5+offset])
	} else {
		driver = strings.TrimSpace(cells[1])
		team = strings.TrimSpace(cells[2])
		gap = strings.TrimSpace(cells[3])
		bestTime = strings.TrimSpace(cells[4])
		tyreRaw = strings.TrimSpace(cells[5])
	}

	if driver == "" || team == "" {
		return model.AdminMotorsportStandingRow{}, false
	}

	row := model.AdminMotorsportStandingRow{
		Position:  pos,
		Driver:    driver,
		Team:      team,
		Gap:       gap,
		Time:      bestTime,
		TeamColor: motorsportTeamColor(team),
	}

	fields := strings.Fields(strings.ToUpper(tyreRaw))
	if len(fields) > 0 {
		row.Tyre = fields[0]
	}
	if m := motorsportTyreLapsRe.FindStringSubmatch(tyreRaw); len(m) == 2 {
		if v, err := strconv.Atoi(m[1]); err == nil {
			row.Laps = v
		}
	}
	if m := motorsportTyrePitRe.FindStringSubmatch(tyreRaw); len(m) == 2 {
		if v, err := strconv.Atoi(m[1]); err == nil {
			row.PitCount = v
		}
	}
	return row, true
}

func motorsportTeamColor(team string) string {
	switch strings.ToLower(strings.TrimSpace(team)) {
	case "mercedes":
		return "#00D2BE"
	case "mclaren":
		return "#FF8000"
	case "ferrari":
		return "#E8002D"
	case "red bull racing":
		return "#3671C6"
	case "rb f1 team", "racing bulls":
		return "#5E8FAA"
	case "audi", "sauber":
		return "#52E252"
	case "alpine":
		return "#2293D1"
	case "williams":
		return "#1868DB"
	case "haas":
		return "#B6BABD"
	case "aston martin":
		return "#229971"
	case "cadillac formula 1 team", "cadillac":
		return "#8B1E3F"
	default:
		return "#64748B"
	}
}
