package handlers

import (
	"net/http"

	"toinc_f1_backend/internal/f1livetiming"
	"toinc_f1_backend/internal/model"

	"github.com/gin-gonic/gin"
)

// @Summary MiniProgram F1 Live Timing
// @Description 返回 GraphQL live timing manager 当前缓存快照，供小程序页面使用。
// @Tags MiniProgram
// @Produce json
// @Success 200 {object} map[string]interface{}
// @Failure 503 {object} model.ErrorResponse
// @Router /api/v1/mp/f1/live-timing [get]
func MpF1LiveTiming(manager *f1livetiming.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		if manager == nil {
			LogReqError(c, "mp_f1_live_timing", "service_unavailable", nil)
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "service_unavailable"})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"ok":               true,
			"generated_at_utc": nowUTCISO8601(),
			"source":           "f1_live_timing",
			"status":           manager.Snapshot(),
		})
	}
}
