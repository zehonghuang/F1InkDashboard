package thirdparty

import (
	"context"
	"sort"
	"time"
)

func OpenF1LatestWeather(ctx context.Context) (map[string]any, bool) {
	var rows []map[string]any
	if err := GetJSON(ctx, "https://api.openf1.org/v1/weather?session_key=latest", &rows); err != nil {
		return nil, false
	}
	if len(rows) == 0 {
		return nil, false
	}

	type it struct {
		Idx int
		T   time.Time
	}
	idxs := make([]it, 0, len(rows))
	for i, r := range rows {
		ds, _ := r["date"].(string)
		if ds == "" {
			continue
		}
		dt, err := time.Parse(time.RFC3339Nano, ds)
		if err != nil {
			dt, err = time.Parse(time.RFC3339, ds)
		}
		if err != nil {
			continue
		}
		idxs = append(idxs, it{Idx: i, T: dt})
	}
	if len(idxs) == 0 {
		return rows[len(rows)-1], true
	}
	sort.Slice(idxs, func(i, j int) bool { return idxs[i].T.After(idxs[j].T) })
	return rows[idxs[0].Idx], true
}
