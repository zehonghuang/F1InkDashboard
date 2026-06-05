package tasks

import (
	"log"
	"sync"
	"time"

	"toinc_f1_backend/internal/config"

	"gorm.io/gorm"
)

type MpNewsHeroLimiter struct {
	cfg config.Config
	db  *gorm.DB

	mu      sync.Mutex
	running bool
}

func StartMpNewsHeroLimiter(cfg config.Config, db *gorm.DB) *MpNewsHeroLimiter {
	if db == nil {
		return nil
	}
	if !cfg.MpNewsSchedulerEnabled {
		return nil
	}

	l := &MpNewsHeroLimiter{
		cfg: cfg,
		db:  db,
	}
	go func() {
		l.runOnce()
		l.loop()
	}()
	return l
}

func (l *MpNewsHeroLimiter) loop() {
	for {
		next := nextDailyAtHour(time.Now(), l.cfg.MpNewsSchedulerDailyHour)
		timer := time.NewTimer(time.Until(next))
		<-timer.C
		timer.Stop()

		l.runOnce()
	}
}

func nextDailyAtHour(now time.Time, hour int) time.Time {
	if hour < 0 {
		hour = 0
	}
	if hour > 23 {
		hour = 23
	}

	localNow := now.In(time.Local)
	t := time.Date(localNow.Year(), localNow.Month(), localNow.Day(), hour, 0, 0, 0, time.Local)
	if !t.After(localNow) {
		t = t.Add(24 * time.Hour)
	}
	return t
}

func (l *MpNewsHeroLimiter) runOnce() {
	l.mu.Lock()
	if l.running {
		l.mu.Unlock()
		return
	}
	l.running = true
	l.mu.Unlock()

	defer func() {
		l.mu.Lock()
		l.running = false
		l.mu.Unlock()
	}()

	keep := l.cfg.MpNewsSchedulerKeepHero
	if keep <= 0 {
		keep = 5
	}
	if keep > 50 {
		keep = 50
	}

	var total int64
	if err := l.db.Table("mp_news_articles").Where("layout_code = ?", "HERO").Count(&total).Error; err != nil {
		log.Printf("mp_news hero limiter count error: %v", err)
		return
	}
	if total <= int64(keep) {
		return
	}

	var keepIDs []string
	if err := l.db.Table("mp_news_articles").
		Select("id").
		Where("layout_code = ?", "HERO").
		Order("pinned DESC").
		Order("weight DESC").
		Order("published_at DESC").
		Limit(keep).
		Pluck("id", &keepIDs).Error; err != nil {
		log.Printf("mp_news hero limiter select keep ids error: %v", err)
		return
	}

	now := time.Now().UTC()
	res := l.db.Table("mp_news_articles").
		Where("layout_code = ?", "HERO").
		Where("id NOT IN ?", keepIDs).
		Updates(map[string]any{
			"layout_code":       "STANDARD",
			"hero_display_code": nil,
			"updated_at":        now,
		})
	if res.Error != nil {
		log.Printf("mp_news hero limiter update error: %v", res.Error)
		return
	}

	log.Printf("mp_news hero limiter ok: keep=%d demoted=%d", keep, res.RowsAffected)
}
