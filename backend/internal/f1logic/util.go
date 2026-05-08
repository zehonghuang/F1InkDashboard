package f1logic

import (
	"fmt"
	"strings"
	"time"
)

func ParseErgastDT(dateS string, timeS any) (time.Time, bool) {
	ds := strings.TrimSpace(dateS)
	if ds == "" {
		return time.Time{}, false
	}
	ts := ""
	if timeS != nil {
		if s, ok := timeS.(string); ok {
			ts = strings.TrimSpace(s)
		}
	}
	if ts == "" {
		t, err := time.ParseInLocation("2006-01-02", ds, time.UTC)
		if err != nil {
			return time.Time{}, false
		}
		return t.UTC(), true
	}
	ts = strings.ReplaceAll(ts, "Z", "+00:00")
	t, err := time.Parse(time.RFC3339, fmt.Sprintf("%sT%s", ds, ts))
	if err != nil {
		return time.Time{}, false
	}
	return t.UTC(), true
}

func FmtHHMM(dt time.Time, tz *time.Location) string {
	return dt.In(tz).Format("15:04")
}

func FmtDay(dt time.Time, tz *time.Location) string {
	return strings.ToUpper(dt.In(tz).Format("Mon"))
}

func FmtHeaderDate(dt time.Time, tz *time.Location) string {
	return strings.ToUpper(dt.In(tz).Format("Mon Jan 02, 2006"))
}

func FormatHMS(delta time.Duration) string {
	s := int(delta.Seconds())
	if s < 0 {
		s = 0
	}
	h := s / 3600
	m := (s % 3600) / 60
	sec := s % 60
	return fmt.Sprintf("%02d:%02d:%02d", h, m, sec)
}

func FmtGap(deltaMS *int) string {
	if deltaMS == nil || *deltaMS <= 0 {
		return "---"
	}
	return fmt.Sprintf("+%.3f", float64(*deltaMS)/1000.0)
}

func ClampInt(v, minV, maxV int) int {
	if v < minV {
		return minV
	}
	if v > maxV {
		return maxV
	}
	return v
}
