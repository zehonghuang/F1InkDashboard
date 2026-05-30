package model

type MpAuthLoginResponse struct {
	Ok        bool       `json:"ok"`
	Token     string     `json:"token"`
	ExpiresAt string     `json:"expiresAt"`
	User      MpAuthUser `json:"user"`
}

type MpAuthUser struct {
	ID     int64  `json:"id"`
	OpenID string `json:"openid"`
}

type MpAuthUploadAvatarResponse struct {
	Ok        bool   `json:"ok"`
	AvatarURL string `json:"avatar_url"`
	Mime      string `json:"mime"`
	Bytes     int64  `json:"bytes"`
}

type MpAuthBindDeviceResponse struct {
	Ok       bool   `json:"ok"`
	DeviceID string `json:"device_id"`
}

type MpAuthMeUser struct {
	ID        int64  `json:"id"`
	OpenID    string `json:"openid"`
	UnionID   string `json:"unionid"`
	NickName  string `json:"nick_name"`
	AvatarURL string `json:"avatar_url"`
}

type MpAuthMeResponse struct {
	Ok       bool         `json:"ok"`
	User     MpAuthMeUser `json:"user"`
	DeviceID string       `json:"device_id"`
}
