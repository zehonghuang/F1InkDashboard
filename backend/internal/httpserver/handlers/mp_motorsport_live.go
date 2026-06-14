package handlers

import (
	"net/http"

	"toinc_f1_backend/internal/model"
	"toinc_f1_backend/internal/motorsportlive"

	"github.com/gin-gonic/gin"
)

// @Summary Motorsport Live WS 缓存
// @Description 返回后端 Motorsport Live WebSocket 客户端的连接状态，以及最近缓存的原始消息。
// @Tags MiniProgram
// @Produce json
// @Success 200 {object} map[string]interface{}
// @Failure 503 {object} model.ErrorResponse
// @Router /api/v1/mp/motorsport/live [get]
func MpMotorsportLive(manager *motorsportlive.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		if manager == nil {
			LogReqError(c, "mp_motorsport_live", "service_unavailable", nil)
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "service_unavailable"})
			return
		}
		snap := manager.Snapshot()
		c.JSON(http.StatusOK, gin.H{
			"ok":               true,
			"generated_at_utc": nowUTCISO8601(),
			"source":           "motorsport_ws",
			"status":           snap,
		})
	}
}
