package thirdparty

import (
	"context"
	"fmt"
	"strings"
)

func ErgastLastWinner(ctx context.Context) (string, bool) {
	var data map[string]any
	if err := GetJSON(ctx, "https://api.jolpi.ca/ergast/f1/current/last/results/1.json", &data); err != nil {
		return "", false
	}
	mr, _ := data["MRData"].(map[string]any)
	rt, _ := mr["RaceTable"].(map[string]any)
	races, _ := rt["Races"].([]any)
	if len(races) == 0 {
		return "", false
	}
	r0, _ := races[0].(map[string]any)
	results, _ := r0["Results"].([]any)
	if len(results) == 0 {
		return "", false
	}
	res0, _ := results[0].(map[string]any)
	drv, _ := res0["Driver"].(map[string]any)
	given, _ := drv["givenName"].(string)
	family, _ := drv["familyName"].(string)
	given = strings.TrimSpace(given)
	family = strings.TrimSpace(family)
	if given == "" && family == "" {
		return "", false
	}
	g0 := ""
	if given != "" {
		g0 = string([]rune(given)[0])
	}
	s := strings.TrimSpace(fmt.Sprintf("%s. %s", g0, family))
	return s, s != ""
}
