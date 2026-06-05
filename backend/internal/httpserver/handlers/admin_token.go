package handlers

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"toinc_f1_backend/internal/model"
)

func adminTokenOK(c *gin.Context, expected string) bool {
	expected = strings.TrimSpace(expected)
	if expected == "" {
		return true
	}
	token := strings.TrimSpace(c.Query("token"))
	if token == "" || token != expected {
		c.JSON(http.StatusUnauthorized, model.ErrorResponse{Ok: false, Error: "unauthorized"})
		return false
	}
	return true
}
