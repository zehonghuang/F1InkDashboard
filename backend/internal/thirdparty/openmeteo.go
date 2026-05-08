package thirdparty

import (
	"context"
	"net/url"
)

func OpenMeteoCurrentTempC(ctx context.Context) (float64, bool) {
	u, _ := url.Parse("https://api.open-meteo.com/v1/forecast")
	q := u.Query()
	q.Set("latitude", "26.0325")
	q.Set("longitude", "50.5106")
	q.Set("current", "temperature_2m")
	q.Set("timezone", "UTC")
	u.RawQuery = q.Encode()

	var data map[string]any
	if err := GetJSON(ctx, u.String(), &data); err != nil {
		return 0, false
	}
	cur, _ := data["current"].(map[string]any)
	t, ok := cur["temperature_2m"].(float64)
	if ok {
		return t, true
	}
	return 0, false
}
