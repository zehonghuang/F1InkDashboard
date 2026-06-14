package motorsportlive

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"

	"toinc_f1_backend/internal/model"

	"golang.org/x/net/html"
)

var (
	motorsportTyreLapsRe = regexp.MustCompile(`(?i)(\d+)L\b`)
	motorsportTyrePitRe  = regexp.MustCompile(`(?i)(\d+)Pit\b`)
)

type parsedEnvelope struct {
	MessageType   string `json:"message_type"`
	MessageAction string `json:"message_action"`
	TimingType    string `json:"timing_type"`
	Message       struct {
		Params struct {
			Message string `json:"message"`
		} `json:"params"`
	} `json:"message"`
}

type LiveStandings struct {
	SourceSeq           int64                           `json:"source_seq"`
	MessageType         string                          `json:"message_type,omitempty"`
	MessageAction       string                          `json:"message_action,omitempty"`
	TimingType          string                          `json:"timing_type,omitempty"`
	Status              string                          `json:"status,omitempty"`
	SessionTitle        string                          `json:"session_title,omitempty"`
	FlagTitle           string                          `json:"flag_title,omitempty"`
	RCLState            string                          `json:"rcl_state,omitempty"`
	LiveTimingID        string                          `json:"live_timing_id,omitempty"`
	LiveTextID          string                          `json:"live_text_id,omitempty"`
	SubEventID          string                          `json:"sub_event_id,omitempty"`
	UpstreamUpdatedAtUTC string                         `json:"upstream_updated_at_utc,omitempty"`
	ParsedAtUTC         string                          `json:"parsed_at_utc"`
	Rows                []model.AdminMotorsportStandingRow `json:"rows"`
}

func parseStandingsFromPayload(seq int64, payload []byte) (*LiveStandings, error) {
	var env parsedEnvelope
	if err := json.Unmarshal(payload, &env); err != nil {
		return nil, err
	}
	if strings.TrimSpace(env.MessageType) != "timing" {
		return nil, nil
	}
	rawHTML := strings.TrimSpace(env.Message.Params.Message)
	if rawHTML == "" {
		return nil, fmt.Errorf("empty_timing_html")
	}
	status, sessionTitle, flagTitle, attrs, rows, err := parseLiveTimingHTML(rawHTML)
	if err != nil {
		return nil, err
	}
	return &LiveStandings{
		SourceSeq:            seq,
		MessageType:          env.MessageType,
		MessageAction:        env.MessageAction,
		TimingType:           env.TimingType,
		Status:               status,
		SessionTitle:         sessionTitle,
		FlagTitle:            flagTitle,
		RCLState:             attrs["data-rcl-state"],
		LiveTimingID:         firstNonEmpty(attrs["live-timing-id"], attrs["data-live-timing-id"]),
		LiveTextID:           attrs["data-live-text-id"],
		SubEventID:           attrs["data-sub-event-id"],
		UpstreamUpdatedAtUTC: normalizeTime(attrs["data-last-updated"]),
		ParsedAtUTC:          time.Now().UTC().Format(time.RFC3339Nano),
		Rows:                 rows,
	}, nil
}

func parseLiveTimingHTML(raw string) (string, string, string, map[string]string, []model.AdminMotorsportStandingRow, error) {
	doc, err := html.Parse(strings.NewReader(raw))
	if err != nil {
		return "", "", "", nil, nil, err
	}

	attrs := map[string]string{}
	var table *html.Node
	var liveTimingNode *html.Node
	var statusNode *html.Node
	var headerStatusNode *html.Node
	var flagNode *html.Node

	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode {
			switch {
			case liveTimingNode == nil && n.Data == "msnt-live-timing":
				liveTimingNode = n
			case statusNode == nil && hasClassToken(n, "mslt_status-value"):
				statusNode = n
			case headerStatusNode == nil && hasClassToken(n, "msnt-live-timing-header_status"):
				headerStatusNode = n
			case flagNode == nil && hasClassToken(n, "mslt-msg__icon-wrapper"):
				flagNode = n
			case table == nil && n.Data == "table":
				table = n
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(doc)

	if liveTimingNode != nil {
		for _, a := range liveTimingNode.Attr {
			attrs[a.Key] = a.Val
		}
	}

	status := cleanHTMLText(nodeText(statusNode))
	sessionTitle := extractSessionTitle(headerStatusNode)
	flagTitle := strings.TrimSpace(attrValue(flagNode, "title"))

	if table == nil {
		return status, sessionTitle, flagTitle, attrs, nil, fmt.Errorf("standings_table_not_found")
	}

	rows := make([]model.AdminMotorsportStandingRow, 0, 24)
	for tr := table.FirstChild; tr != nil; tr = nextNode(tr, table) {
		if tr.Type != html.ElementNode || tr.Data != "tr" {
			continue
		}
		cells := tableRowCells(tr)
		if len(cells) < 5 || isStandingsHeaderRow(cells) {
			continue
		}
		row, ok := parseStandingsRow(cells)
		if !ok {
			continue
		}
		rows = append(rows, row)
	}
	if len(rows) == 0 {
		return status, sessionTitle, flagTitle, attrs, nil, fmt.Errorf("standings_rows_not_found")
	}
	return status, sessionTitle, flagTitle, attrs, rows, nil
}

func extractSessionTitle(n *html.Node) string {
	if n == nil {
		return ""
	}
	var title string
	var walk func(*html.Node)
	walk = func(cur *html.Node) {
		if title != "" || cur == nil {
			return
		}
		if cur.Type == html.ElementNode && hasClassToken(cur, "text-body") {
			title = cleanHTMLText(nodeText(cur))
			return
		}
		for c := cur.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
			if title != "" {
				return
			}
		}
	}
	walk(n)
	if title != "" {
		return title
	}
	return cleanHTMLText(nodeText(n))
}

func hasClassToken(n *html.Node, token string) bool {
	if n == nil || token == "" {
		return false
	}
	for _, a := range n.Attr {
		if a.Key != "class" {
			continue
		}
		for _, part := range strings.Fields(strings.TrimSpace(a.Val)) {
			if part == token {
				return true
			}
		}
	}
	return false
}

func attrValue(n *html.Node, key string) string {
	if n == nil {
		return ""
	}
	for _, a := range n.Attr {
		if a.Key == key {
			return a.Val
		}
	}
	return ""
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
	return strings.Contains(line, "driver") || (strings.Contains(line, "gap") && strings.Contains(line, "time"))
}

func parseStandingsRow(cells []string) (model.AdminMotorsportStandingRow, bool) {
	if len(cells) < 5 {
		return model.AdminMotorsportStandingRow{}, false
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

	switch {
	case len(cells) >= 7:
		driver = strings.TrimSpace(cells[2])
		team = strings.TrimSpace(cells[3])
		gap = strings.TrimSpace(cells[4])
		bestTime = strings.TrimSpace(cells[5])
		tyreRaw = strings.TrimSpace(cells[6])
	case len(cells) == 6:
		driver = strings.TrimSpace(cells[1])
		team = strings.TrimSpace(cells[2])
		gap = strings.TrimSpace(cells[3])
		bestTime = strings.TrimSpace(cells[4])
		tyreRaw = strings.TrimSpace(cells[5])
	default:
		return model.AdminMotorsportStandingRow{}, false
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

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		v = strings.TrimSpace(v)
		if v != "" {
			return v
		}
	}
	return ""
}

func normalizeTime(v string) string {
	v = strings.TrimSpace(v)
	if v == "" {
		return ""
	}
	if t, err := time.Parse(time.RFC3339, v); err == nil {
		return t.UTC().Format(time.RFC3339Nano)
	}
	return v
}
