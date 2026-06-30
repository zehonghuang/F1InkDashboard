package handlers

import (
	"net/http"

	"toinc_f1_backend/internal/config"
	"toinc_f1_backend/internal/f1livetiming"
	"toinc_f1_backend/internal/model"

	"github.com/gin-gonic/gin"
)

// @Summary Admin F1 Live Timing
// @Description 返回 GraphQL live timing manager 当前缓存快照。
// @Tags Admin
// @Produce json
// @Success 200 {object} model.AdminF1LiveTimingResponse
// @Failure 401 {object} model.ErrorResponse
// @Failure 503 {object} model.ErrorResponse
// @Router /api/v1/admin/f1/live-timing [get]
func AdminF1LiveTiming(cfg config.Config, manager *f1livetiming.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !adminTokenOK(c, cfg.AdminToken) {
			return
		}
		if manager == nil {
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "service_unavailable"})
			return
		}
		c.JSON(http.StatusOK, model.AdminF1LiveTimingResponse{
			Ok:             true,
			GeneratedAtUTC: nowUTCISO8601(),
			Status:         manager.Snapshot(),
		})
	}
}
