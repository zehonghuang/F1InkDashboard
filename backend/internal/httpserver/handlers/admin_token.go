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
	if token == "" {
		token = strings.TrimSpace(c.PostForm("token"))
	}
	if token == "" {
		authHeader := strings.TrimSpace(c.GetHeader("Authorization"))
		if strings.HasPrefix(strings.ToLower(authHeader), "bearer ") {
			token = strings.TrimSpace(authHeader[7:])
		} else if strings.HasPrefix(strings.ToLower(authHeader), "token ") {
			token = strings.TrimSpace(authHeader[6:])
		} else {
			token = authHeader
		}
	}
	if token == "" || token != expected {
		c.JSON(http.StatusUnauthorized, model.ErrorResponse{Ok: false, Error: "unauthorized"})
		return false
	}
	return true
}
