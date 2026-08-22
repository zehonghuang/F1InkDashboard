package model

type OkResponse struct {
	Ok bool `json:"ok"`
}

type ErrorResponse struct {
	Ok    bool   `json:"ok"`
	Error string `json:"error"`
}

type GenericObject map[string]any

type WsStatusResponse struct {
	Ok      bool `json:"ok"`
	Clients int  `json:"clients"`
}

type WsBroadcastResponse struct {
	Ok   bool `json:"ok"`
	Sent int  `json:"sent"`
}

type NewsWsStatusResponse struct {
	Enabled bool          `json:"enabled"`
	Running bool          `json:"running"`
	Clients NewsWsClients `json:"clients"`
}

type NewsWsClients struct {
	Ws int `json:"ws"`
}

type NewsIngestJSONBody struct {
	Topic   string         `json:"topic"`
	Payload map[string]any `json:"payload"`
}

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
