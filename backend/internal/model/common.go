package model

type OkResponse struct {
	Ok bool `json:"ok"`
}

type ErrorResponse struct {
	Ok    bool   `json:"ok"`
	Error string `json:"error"`
}

type GenericObject map[string]any
