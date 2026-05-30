package model

type WechatPayJSAPIPrepayRequest struct {
	Description string `json:"description"`
	OutTradeNo  string `json:"out_trade_no"`
	Total       int64  `json:"total"`
	Currency    string `json:"currency"`
	OpenID      string `json:"openid"`
	Attach      string `json:"attach"`
}

type WechatPayJSAPIPrepayResponse struct {
	Ok     bool        `json:"ok"`
	Params interface{} `json:"params"`
}

type WechatPayQueryOrderResponse struct {
	Ok    bool        `json:"ok"`
	Order interface{} `json:"order"`
}

type WechatPayNotifyResponse struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}
