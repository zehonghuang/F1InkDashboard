package message

import (
	"context"
	"errors"
	"fmt"
	"log"
	"runtime"
	"sync"
	"time"

	"msg-gateway/internal/model"
	"msg-gateway/internal/platform"
	"msg-gateway/internal/wechatshop"

	"gorm.io/gorm"
)

const (
	defaultIngestQueueSize = 10000
	defaultIngestWorkers   = 4
)

type incomingJob struct {
	receivedAt time.Time
	event      *model.PlatformEvent
}

type Service struct {
	db      *gorm.DB
	clients map[string]platform.Client

	ingestQueue chan incomingJob
	ingestWg    sync.WaitGroup
	ingestStop  chan struct{}
	ingestOnce  sync.Once
}

func NewService(db *gorm.DB) *Service {
	s := &Service{
		db:          db,
		clients:     make(map[string]platform.Client),
		ingestQueue: make(chan incomingJob, defaultIngestQueueSize),
		ingestStop:  make(chan struct{}),
	}
	return s
}

func (s *Service) StartIngestWorkers(num int) {
	if num <= 0 {
		num = defaultIngestWorkers
	}
	if num <= 0 {
		num = runtime.NumCPU()
	}
	for i := 0; i < num; i++ {
		s.ingestWg.Add(1)
		go s.ingestWorker(i)
	}
	log.Printf("[message] ingest workers started: count=%d queue_size=%d", num, defaultIngestQueueSize)
}

func (s *Service) StopIngestWorkers() {
	s.ingestOnce.Do(func() {
		close(s.ingestStop)
	})
	s.ingestWg.Wait()
	log.Printf("[message] ingest workers stopped")
}

func (s *Service) ingestWorker(id int) {
	defer s.ingestWg.Done()
	logPrefix := fmt.Sprintf("[message:worker#%d]", id)
	for {
		select {
		case <-s.ingestStop:
			for {
				select {
				case job, ok := <-s.ingestQueue:
					if !ok {
						log.Printf("%s drain done, exit", logPrefix)
						return
					}
					s.processIngestJob(logPrefix, job)
				default:
					log.Printf("%s queue empty after stop signal, exit", logPrefix)
					return
				}
			}
		case job, ok := <-s.ingestQueue:
			if !ok {
				log.Printf("%s queue closed, exit", logPrefix)
				return
			}
			s.processIngestJob(logPrefix, job)
		}
	}
}

func (s *Service) processIngestJob(logPrefix string, job incomingJob) {
	event := job.event
	latency := time.Since(job.receivedAt)
	log.Printf("%s ingest event=%s id=%s platform=%s order_id=%s uid=%s shop_id=%s latency=%s payload=%s",
		logPrefix,
		event.EventType,
		event.EventID,
		event.Platform,
		event.OrderID,
		event.PlatformUID,
		event.ShopID,
		latency,
		truncateLogSafe(event.RawPayload),
	)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := s.IngestIncomingEvent(ctx, event); err != nil {
		log.Printf("%s ingest failed event=%s id=%s err=%v", logPrefix, event.EventType, event.EventID, err)
	}
}

func truncateLogSafe(s string) string {
	const max = 512
	if len(s) <= max {
		return s
	}
	return s[:max] + fmt.Sprintf("...[truncated %d bytes]", len(s)-max)
}

func (s *Service) RegisterClient(platformName string, client platform.Client) {
	s.clients[platformName] = client
}

func (s *Service) GetClient(platformName string) (platform.Client, bool) {
	c, ok := s.clients[platformName]
	return c, ok
}

type SendParams struct {
	Platform       string
	PlatformUID    string
	MsgType        string
	Content        string
	MediaURL       string
	LinkTitle      string
	LinkURL        string
	ProductID      string
	AgentID        uint64
}

func (s *Service) SendMessage(ctx context.Context, p SendParams) (*model.Message, error) {
	if p.Platform == "" || p.PlatformUID == "" {
		return nil, errors.New("missing_platform_or_uid")
	}
	client, ok := s.clients[p.Platform]
	if !ok {
		return nil, errors.New("platform_client_not_registered")
	}

	user, err := s.upsertPlatformUser(ctx, p.Platform, p.PlatformUID)
	if err != nil {
		log.Printf("[message] upsert user failed: %v", err)
	}

	conv, err := s.getOrCreateConversation(ctx, p.Platform, p.PlatformUID, user)
	if err != nil {
		return nil, err
	}

	msg := &model.Message{
		Platform:       p.Platform,
		ConversationID: conv.ID,
		PlatformUserID: user.ID,
		MsgType:        p.MsgType,
		Sender:         model.SenderService,
		Content:        p.Content,
		MediaURL:       p.MediaURL,
		LinkTitle:      p.LinkTitle,
		LinkURL:        p.LinkURL,
		ProductID:      p.ProductID,
		Status:         model.MsgStatusPending,
		AgentID:        p.AgentID,
	}
	if s.db != nil {
		if err := s.db.Create(msg).Error; err != nil {
			log.Printf("[message] create msg failed: %v", err)
		}
	}

	msg.Status = model.MsgStatusSending
	platformMsgID, sendErr := client.SendMessage(ctx, platform.MessagePayload{
		PlatformUID: p.PlatformUID,
		MsgType:     p.MsgType,
		Content:     p.Content,
		MediaURL:    p.MediaURL,
		LinkTitle:   p.LinkTitle,
		LinkURL:     p.LinkURL,
		ProductID:   p.ProductID,
	})

	if sendErr != nil {
		msg.Status = model.MsgStatusFailed
		msg.FailReason = sendErr.Error()
		msg.RetryCount = 1
		if s.db != nil {
			s.db.Model(msg).Updates(map[string]any{
				"status":      msg.Status,
				"fail_reason": msg.FailReason,
				"retry_count": msg.RetryCount,
			})
		}
		return msg, sendErr
	}

	sentAt := time.Now()
	msg.Status = model.MsgStatusSent
	msg.PlatformMsgID = platformMsgID
	msg.SentAt = &sentAt
	if s.db != nil {
		s.db.Model(msg).Updates(map[string]any{
			"status":          msg.Status,
			"platform_msg_id": msg.PlatformMsgID,
			"sent_at":         msg.SentAt,
		})
		s.db.Model(conv).Updates(map[string]any{
			"last_message":    truncate(p.Content, 200),
			"last_message_at": sentAt,
			"last_sender":     model.SenderService,
		})
	}
	return msg, nil
}

func (s *Service) upsertPlatformUser(ctx context.Context, plat, uid string) (*model.PlatformUser, error) {
	if s.db == nil {
		return &model.PlatformUser{Platform: plat, PlatformUID: uid}, nil
	}
	var u model.PlatformUser
	err := s.db.Where("platform = ? AND platform_uid = ?", plat, uid).First(&u).Error
	if err == nil {
		return &u, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	u = model.PlatformUser{
		Platform:    plat,
		PlatformUID: uid,
	}
	if err := s.db.Create(&u).Error; err != nil {
		return nil, err
	}
	return &u, nil
}

func (s *Service) getOrCreateConversation(ctx context.Context, plat, uid string, user *model.PlatformUser) (*model.Conversation, error) {
	if s.db == nil {
		return &model.Conversation{Platform: plat, PlatformUserID: user.ID}, nil
	}
	var conv model.Conversation
	err := s.db.Where("platform = ? AND platform_user_id = ?", plat, user.ID).First(&conv).Error
	if err == nil {
		return &conv, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	convID := plat + ":" + uid
	conv = model.Conversation{
		Platform:       plat,
		PlatformUserID: user.ID,
		ConversationID: convID,
		Status:         "active",
	}
	if err := s.db.Create(&conv).Error; err != nil {
		return nil, err
	}
	return &conv, nil
}

func (s *Service) IngestIncomingEvent(ctx context.Context, event *model.PlatformEvent) error {
	if s.db != nil {
		var existing model.PlatformEvent
		err := s.db.Where("event_id = ? AND platform = ?", event.EventID, event.Platform).First(&existing).Error
		if err == nil {
			return nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		event.Processed = false
		if err := s.db.Create(event).Error; err != nil {
			return err
		}
	}
	return s.processIncomingEvent(ctx, event)
}

func (s *Service) processIncomingEvent(ctx context.Context, event *model.PlatformEvent) error {
	now := time.Now()
	isOrderEvent := event.OrderID != ""

	if !isOrderEvent && event.PlatformUID != "" {
		user, err := s.upsertPlatformUser(ctx, event.Platform, event.PlatformUID)
		if err != nil {
			log.Printf("[message] upsert user on event failed: %v", err)
		}
		conv, err := s.getOrCreateConversation(ctx, event.Platform, event.PlatformUID, user)
		if err != nil {
			log.Printf("[message] get conv on event failed: %v", err)
		}

		client, ok := s.clients[event.Platform]
		if ok && event.ConversationID != "" && event.PlatformUID != "" {
			_ = client.MarkConversationRead(ctx, event.ConversationID, event.PlatformUID)
		}

		if s.db != nil && conv.ID > 0 {
			s.db.Model(conv).Updates(map[string]any{
				"last_message_at": now,
				"last_sender":     model.SenderUser,
				"unread_count":    gorm.Expr("unread_count + 1"),
				"last_message":    fmtSummaryFromEvent(event),
			})
		}
	} else {
		log.Printf("[message] order event: platform=%s event=%s order_id=%s uid=%s",
			event.Platform, event.EventType, event.OrderID, event.PlatformUID)
	}

	if s.db != nil {
		s.db.Model(event).Updates(map[string]any{
			"processed":    true,
			"processed_at": now,
		})
	}
	return nil
}

func fmtSummaryFromEvent(event *model.PlatformEvent) string {
	switch event.EventType {
	case wechatshop.EventOrderNew:
		return fmt.Sprintf("新订单通知：%s", event.OrderID)
	case wechatshop.EventOrderPay:
		return fmt.Sprintf("订单支付成功：%s", event.OrderID)
	}
	return "[事件] " + event.EventType
}

func (s *Service) ListConversations(ctx context.Context, platform string, page, pageSize int) ([]model.Conversation, int64, error) {
	if s.db == nil {
		return nil, 0, errors.New("db_disabled")
	}
	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 || pageSize > 100 {
		pageSize = 20
	}
	q := s.db.Model(&model.Conversation{})
	if platform != "" {
		q = q.Where("platform = ?", platform)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var list []model.Conversation
	if err := q.Order("last_message_at DESC, id DESC").
		Offset((page - 1) * pageSize).
		Limit(pageSize).
		Find(&list).Error; err != nil {
		return nil, 0, err
	}
	return list, total, nil
}

func (s *Service) ListMessages(ctx context.Context, conversationID uint64, page, pageSize int) ([]model.Message, int64, error) {
	if s.db == nil {
		return nil, 0, errors.New("db_disabled")
	}
	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 || pageSize > 200 {
		pageSize = 50
	}
	q := s.db.Model(&model.Message{}).Where("conversation_id = ?", conversationID)
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var list []model.Message
	if err := q.Order("id DESC").
		Offset((page - 1) * pageSize).
		Limit(pageSize).
		Find(&list).Error; err != nil {
		return nil, 0, err
	}
	for i, j := 0, len(list)-1; i < j; i, j = i+1, j-1 {
		list[i], list[j] = list[j], list[i]
	}
	return list, total, nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}

func (s *Service) IngestIncomingEventAsync(event *model.PlatformEvent) bool {
	if event == nil {
		return false
	}
	job := incomingJob{
		receivedAt: time.Now(),
		event:      event,
	}
	select {
	case s.ingestQueue <- job:
		return true
	default:
		log.Printf("[message:async] QUEUE FULL (cap=%d) => dropping event=%s id=%s platform=%s",
			defaultIngestQueueSize, event.EventType, event.EventID, event.Platform)
		return false
	}
}
