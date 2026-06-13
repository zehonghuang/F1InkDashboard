package tasks

import (
	"toinc_f1_backend/internal/config"

	"gorm.io/gorm"
)

type Manager struct {
	mpNewsHeroLimiter          *MpNewsHeroLimiter
	motorsportResultsScheduler *MotorsportResultsScheduler
}

func Start(cfg config.Config, db *gorm.DB) *Manager {
	if db == nil {
		return nil
	}

	m := &Manager{}
	m.mpNewsHeroLimiter = StartMpNewsHeroLimiter(cfg, db)
	m.motorsportResultsScheduler = StartMotorsportResultsScheduler(cfg, db)
	return m
}
