package handlers

import (
	"toinc_f1_backend/internal/model"

	"github.com/gin-gonic/gin"
)

// @Summary 健康检查
// @Description 服务存活探针。
// @Tags Health
// @Produce json
// @Success 200 {object} model.OkResponse
// @Router /health [get]
func Health() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.JSON(200, model.OkResponse{Ok: true})
	}
}
