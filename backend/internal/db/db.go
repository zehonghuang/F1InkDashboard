package db

import (
	"fmt"
	"time"

	"toinc_f1_backend/internal/config"
	"toinc_f1_backend/internal/model"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
)

type DB struct {
	Gorm *gorm.DB
}

func Connect(cfg config.MySQLConfig) (*DB, error) {
	if !cfg.Enabled {
		return &DB{Gorm: nil}, nil
	}

	dsn := fmt.Sprintf("%s:%s@tcp(%s:%d)/%s?charset=%s&parseTime=true&loc=UTC&timeout=10s&readTimeout=30s&writeTimeout=30s",
		cfg.User,
		cfg.Password,
		cfg.Host,
		cfg.Port,
		cfg.DB,
		cfg.Charset,
	)
	g, err := gorm.Open(mysql.Open(dsn), &gorm.Config{})
	if err != nil {
		return nil, err
	}

	sqlDB, err := g.DB()
	if err != nil {
		return nil, err
	}
	sqlDB.SetConnMaxLifetime(5 * time.Minute)
	sqlDB.SetMaxOpenConns(10)
	sqlDB.SetMaxIdleConns(5)

	if err := autoMigrate(g); err != nil {
		return nil, fmt.Errorf("auto_migrate_failed: %w", err)
	}

	return &DB{Gorm: g}, nil
}

func autoMigrate(g *gorm.DB) error {
	if g == nil {
		return nil
	}
	return g.AutoMigrate(
		&model.MpPoster{},
		&model.MpShopProduct{},
	)
}
