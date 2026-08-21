package model

type MpWechatGroupConfig struct {
	Name    string `json:"name"`
	Hint    string `json:"hint"`
	QrImage string `json:"qr_image"`
}

type MpWechatGroupGetResponse struct {
	Ok     bool               `json:"ok"`
	Config MpWechatGroupConfig `json:"config"`
}

type MpWechatGroupUpdateRequest struct {
	Name string `json:"name"`
	Hint string `json:"hint"`
}

type MpWechatGroupUpdateResponse struct {
	Ok     bool               `json:"ok"`
	Config MpWechatGroupConfig `json:"config"`
}

type MpWechatGroupUploadQrResponse struct {
	Ok        bool   `json:"ok"`
	QrImage   string `json:"qr_image"`
	Mime      string `json:"mime"`
	Bytes     int64  `json:"bytes"`
}
