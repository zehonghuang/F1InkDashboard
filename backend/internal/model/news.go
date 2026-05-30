package model

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
