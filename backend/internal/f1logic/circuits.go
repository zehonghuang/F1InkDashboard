package f1logic

import (
	"regexp"
	"strings"
	"unicode"
)

func PickCircuitForRace(raceName string, circuitID string, circuitAssets map[string]any) map[string]any {
	itemsAny, _ := circuitAssets["items"].([]any)
	if len(itemsAny) == 0 {
		return nil
	}
	byCircuitID := map[string]map[string]any{}
	bySlug := map[string]map[string]any{}
	for _, it := range itemsAny {
		m, ok := it.(map[string]any)
		if !ok {
			continue
		}
		if cid, ok := m["circuit_id"].(string); ok {
			c := strings.ToLower(strings.TrimSpace(cid))
			if c != "" {
				byCircuitID[c] = m
			}
		}
		if slug, ok := m["formula1_slug"].(string); ok {
			s := strings.ToLower(strings.TrimSpace(slug))
			if s != "" {
				bySlug[s] = m
			}
		}
	}
	if circuitID != "" {
		if hit, ok := byCircuitID[strings.ToLower(strings.TrimSpace(circuitID))]; ok {
			return hit
		}
	}
	if strings.TrimSpace(raceName) == "" {
		return nil
	}
	for _, slug := range guessRaceSlug(raceName) {
		if hit, ok := bySlug[slug]; ok {
			return hit
		}
	}
	return nil
}

func slugify(text string) string {
	s := strings.TrimSpace(strings.ToLower(text))
	if s == "" {
		return ""
	}
	s = strings.ReplaceAll(s, "&", " and ")
	reGP := regexp.MustCompile(`\bgrand prix\b`)
	s = reGP.ReplaceAllString(s, "")
	reGP2 := regexp.MustCompile(`\bgp\b`)
	s = reGP2.ReplaceAllString(s, "")

	var b strings.Builder
	lastDash := false
	for _, r := range s {
		if r > 127 {
			if unicode.IsLetter(r) || unicode.IsDigit(r) {
				continue
			}
		}
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
			lastDash = false
			continue
		}
		if !lastDash {
			b.WriteByte('-')
			lastDash = true
		}
	}
	out := strings.Trim(b.String(), "-")
	for strings.Contains(out, "--") {
		out = strings.ReplaceAll(out, "--", "-")
	}
	return out
}

func guessRaceSlug(raceName string) []string {
	base := slugify(raceName)
	out := make([]string, 0, 4)
	if base != "" {
		out = append(out, base)
	}
	demonym := map[string]string{
		"australian":           "australia",
		"chinese":              "china",
		"japanese":             "japan",
		"canadian":             "canada",
		"british":              "great-britain",
		"hungarian":            "hungary",
		"dutch":                "netherlands",
		"italian":              "italy",
		"spanish":              "spain",
		"belgian":              "belgium",
		"azerbaijani":          "azerbaijan",
		"singapore":            "singapore",
		"mexican":              "mexico",
		"brazilian":            "brazil",
		"qatari":               "qatar",
		"emirati":              "united-arab-emirates",
		"saudi":                "saudi-arabia",
		"united-arab-emirates": "united-arab-emirates",
	}
	if v, ok := demonym[base]; ok {
		out = append(out, v)
	}
	aliases := map[string][]string{
		"united-states": {"usa", "us"},
		"mexico-city":   {"mexico"},
		"abu-dhabi":     {"abudhabi"},
		"sao-paulo":     {"brazil"},
		"spanish":       {"spain"},
	}
	for k, vals := range aliases {
		if base == k {
			out = append(out, k)
			out = append(out, vals...)
		}
		for _, v := range vals {
			if base == v {
				out = append(out, k)
				out = append(out, vals...)
				break
			}
		}
	}
	seen := map[string]struct{}{}
	uniq := make([]string, 0, len(out))
	for _, s := range out {
		s = strings.TrimSpace(strings.ToLower(s))
		if s == "" {
			continue
		}
		if _, ok := seen[s]; ok {
			continue
		}
		seen[s] = struct{}{}
		uniq = append(uniq, s)
	}
	return uniq
}
