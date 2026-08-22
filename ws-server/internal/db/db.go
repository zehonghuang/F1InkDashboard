package db

import (
	"fmt"
	"log"
	"time"

	"f1ink_ws_server/internal/config"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

type DB struct {
	Gorm *gorm.DB
}

func Connect(cfg config.MySQLConfig) (*DB, error) {
	if !cfg.Enabled {
		log.Printf("mysql disabled")
		return nil, nil
	}
	dsn := fmt.Sprintf("%s:%s@tcp(%s:%d)/%s?charset=%s&parseTime=True&loc=UTC",
		cfg.User, cfg.Password, cfg.Host, cfg.Port, cfg.DB, cfg.Charset,
	)
	gormLogger := logger.Default.LogMode(logger.Warn)
	gormDB, err := gorm.Open(mysql.Open(dsn), &gorm.Config{
		Logger: gormLogger,
	})
	if err != nil {
		return nil, err
	}
	sqlDB, err := gormDB.DB()
	if err != nil {
		return nil, err
	}
	sqlDB.SetMaxIdleConns(4)
	sqlDB.SetMaxOpenConns(16)
	sqlDB.SetConnMaxLifetime(30 * time.Minute)
	sqlDB.SetConnMaxIdleTime(10 * time.Minute)
	log.Printf("mysql connected host=%s port=%d user=%s db=%s", cfg.Host, cfg.Port, cfg.User, cfg.DB)
	return &DB{Gorm: gormDB}, nil
}
