package model

type WsStatusResponse struct {
	Ok      bool `json:"ok"`
	Clients int  `json:"clients"`
}

type WsBroadcastResponse struct {
	Ok   bool `json:"ok"`
	Sent int  `json:"sent"`
}
