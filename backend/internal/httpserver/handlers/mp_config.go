package handlers

import (
	"time"
	"toinc_f1_backend/internal/config"
	"toinc_f1_backend/internal/model"

	"github.com/gin-gonic/gin"
)

func MpConfigGet(cfg config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.JSON(200, model.MpConfigResponse{
			Ok:             true,
			GeneratedAtUTC: time.Now().UTC().Format(time.RFC3339Nano),
			ReviewMode:     cfg.MpReviewMode,
			NewsDataset:    cfg.MpNewsDataset,
		})
	}
}

