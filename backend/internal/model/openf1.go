package model

type OpenF1StatusResponse struct {
	Enabled   bool          `json:"enabled"`
	Mode      string        `json:"mode"`
	Running   bool          `json:"running"`
	Connected bool          `json:"connected"`
	Clients   OpenF1Clients `json:"clients"`
}

type OpenF1Clients struct {
	WsFW  int `json:"ws_fw"`
	WsRaw int `json:"ws_raw"`
}
