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
	var token string
	if qt := strings.TrimSpace(c.Query("token")); qt != "" {
		token = qt
	}
	if token == "" {
		if ct := strings.TrimSpace(c.PostForm("token")); ct != "" {
			token = ct
		}
	}
	if token == "" {
		authHeader := strings.TrimSpace(c.GetHeader("Authorization"))
		if lower := strings.ToLower(authHeader); strings.HasPrefix(lower, "bearer ") {
			token = strings.TrimSpace(authHeader[7:])
		} else if strings.HasPrefix(lower, "token ") {
			token = strings.TrimSpace(authHeader[6:])
		} else if authHeader != "" {
			token = authHeader
		}
	}
	if token == "" || token != expected {
		c.JSON(http.StatusUnauthorized, model.ErrorResponse{Ok: false, Error: "unauthorized"})
		return false
	}
	return true
}
