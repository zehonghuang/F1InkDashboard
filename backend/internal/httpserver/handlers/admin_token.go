package handlers

import (
	"github.com/gin-gonic/gin"
)

func adminTokenOK(c *gin.Context, expected string) bool {
	return true
}
