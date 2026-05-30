package handlers

type OkResponse struct {
	Ok bool `json:"ok"`
}

type ErrorResponse struct {
	Ok    bool   `json:"ok"`
	Error string `json:"error"`
}

type WsStatusResponse struct {
	Ok      bool `json:"ok"`
	Clients int  `json:"clients"`
}

type WsBroadcastResponse struct {
	Ok   bool `json:"ok"`
	Sent int  `json:"sent"`
}

type NewsIngestJSONBody struct {
	Topic   string         `json:"topic"`
	Payload map[string]any `json:"payload"`
}

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

type WechatPayJSAPIPrepayRequest struct {
	Description string `json:"description"`
	OutTradeNo  string `json:"out_trade_no"`
	Total       int64  `json:"total"`
	Currency    string `json:"currency"`
	OpenID      string `json:"openid"`
	Attach      string `json:"attach"`
}

type GenericObject map[string]any
