package model

type DeviceUserPrefsKVResponse struct {
	Ok             bool              `json:"ok"`
	GeneratedAtUTC string            `json:"generated_at_utc"`
	DeviceID       string            `json:"device_id"`
	KV             DeviceUserPrefsKV `json:"kv"`
}

type DeviceUserPrefsKV struct {
	Nick    *string  `json:"nick"`
	Avatar  *string  `json:"avatar"`
	Team    *string  `json:"team"`
	Teams   []string `json:"teams"`
	Drivers []int    `json:"drivers"`
}
