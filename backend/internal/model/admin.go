package model

import "toinc_f1_backend/internal/f1livetiming"

type AdminUserBrief struct {
	ID        int64  `json:"id"`
	OpenID    string `json:"openid,omitempty"`
	NickName  string `json:"nick_name,omitempty"`
	AvatarURL string `json:"avatar_url,omitempty"`
}

type AdminDeviceBrief struct {
	DeviceID    string `json:"device_id"`
	BoardType   string `json:"board_type,omitempty"`
	FwUserAgent string `json:"fw_user_agent,omitempty"`
	LastSeenAt  string `json:"last_seen_at,omitempty"`
}

type AdminDeviceItem struct {
	DeviceID    string          `json:"device_id"`
	DeviceUUID  string          `json:"device_uuid,omitempty"`
	DeviceKey   string          `json:"device_key,omitempty"`
	Mac         string          `json:"mac,omitempty"`
	BoardType   string          `json:"board_type,omitempty"`
	FwUserAgent string          `json:"fw_user_agent,omitempty"`
	FirstSeenAt string          `json:"first_seen_at,omitempty"`
	LastSeenAt  string          `json:"last_seen_at,omitempty"`
	BoundUser   *AdminUserBrief `json:"bound_user,omitempty"`
}

type AdminDevicesListResponse struct {
	Ok       bool              `json:"ok"`
	Page     int               `json:"page"`
	PageSize int               `json:"page_size"`
	Total    int               `json:"total"`
	Items    []AdminDeviceItem `json:"items"`
}

type AdminDeviceDetailResponse struct {
	Ok   bool            `json:"ok"`
	Item AdminDeviceItem `json:"item"`
}

type AdminUserItem struct {
	ID        int64             `json:"id"`
	OpenID    string            `json:"openid"`
	UnionID   string            `json:"unionid,omitempty"`
	NickName  string            `json:"nick_name,omitempty"`
	AvatarURL string            `json:"avatar_url,omitempty"`
	CreatedAt string            `json:"created_at,omitempty"`
	UpdatedAt string            `json:"updated_at,omitempty"`
	Device    *AdminDeviceBrief `json:"device,omitempty"`
}

type AdminUsersListResponse struct {
	Ok       bool            `json:"ok"`
	Page     int             `json:"page"`
	PageSize int             `json:"page_size"`
	Total    int             `json:"total"`
	Items    []AdminUserItem `json:"items"`
}

type AdminUserDetailResponse struct {
	Ok   bool          `json:"ok"`
	Item AdminUserItem `json:"item"`
}

type AdminBindRequest struct {
	UserID   int64  `json:"user_id"`
	DeviceID string `json:"device_id"`
}

type AdminMotorsportStandingRow struct {
	Position  int    `json:"position"`
	Driver    string `json:"driver"`
	Team      string `json:"team"`
	Gap       string `json:"gap,omitempty"`
	Time      string `json:"time,omitempty"`
	Tyre      string `json:"tyre,omitempty"`
	Laps      int    `json:"laps,omitempty"`
	PitCount  int    `json:"pit_count,omitempty"`
	TeamColor string `json:"team_color,omitempty"`
}

type AdminMotorsportLiveStandingsResponse struct {
	Ok            bool                         `json:"ok"`
	SourceURL     string                       `json:"source_url,omitempty"`
	LiveTimingURL string                       `json:"live_timing_url,omitempty"`
	Status        string                       `json:"status,omitempty"`
	SessionTitle  string                       `json:"session_title,omitempty"`
	FetchedAtUTC  string                       `json:"fetched_at_utc,omitempty"`
	Rows          []AdminMotorsportStandingRow `json:"rows"`
}

type AdminF1LiveTimingResponse struct {
	Ok             bool                  `json:"ok"`
	GeneratedAtUTC string                `json:"generated_at_utc,omitempty"`
	Status         f1livetiming.Snapshot `json:"status"`
}
