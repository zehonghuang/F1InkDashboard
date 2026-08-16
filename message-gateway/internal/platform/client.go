package platform

import (
	"context"
	"msg-gateway/internal/model"
)

type MessagePayload struct {
	PlatformUID string
	MsgType     string
	Content     string
	MediaURL    string
	LinkTitle   string
	LinkURL     string
	ProductID   string
}

type Client interface {
	SendMessage(ctx context.Context, payload MessagePayload) (platformMsgID string, err error)
	VerifyWebhookSignature(signature, timestamp, nonce, body string) bool
	ParseWebhookEvent(body []byte) (*model.PlatformEvent, error)
	MarkConversationRead(ctx context.Context, conversationID, platformUID string) error
}
