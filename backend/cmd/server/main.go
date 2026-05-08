package main

import (
	"log"

	"toinc_f1_backend/internal/config"
	"toinc_f1_backend/internal/db"
	"toinc_f1_backend/internal/httpserver"
)

func main() {
	cfg := config.FromEnv()

	database, err := db.Connect(cfg.MySQL)
	if err != nil {
		log.Fatalf("mysql connect failed: %v", err)
	}

	s := httpserver.New(cfg, database)
	if err := s.Router.Run(cfg.ListenAddr); err != nil {
		log.Fatalf("listen failed: %v", err)
	}
}
