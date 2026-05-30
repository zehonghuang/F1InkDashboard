package handlers

import (
	"toinc_f1_backend/internal/model"

	"github.com/gin-gonic/gin"
)

func RegisterCompatPlaceholders(r *gin.Engine) {
	notImpl := func(c *gin.Context) {
		c.JSON(501, model.ErrorResponse{Ok: false, Error: "not_implemented"})
	}

	r.GET("/api/v1/news/breaking", notImpl)

	r.POST("/api/v1/device/ws/send", notImpl)
}
