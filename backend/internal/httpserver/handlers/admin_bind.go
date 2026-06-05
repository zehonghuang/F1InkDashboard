package handlers

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"toinc_f1_backend/internal/config"
	"toinc_f1_backend/internal/model"
)

func AdminBind(cfg config.Config, db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !adminTokenOK(c, cfg.AdminToken) {
			return
		}
		if db == nil {
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "mysql_required"})
			return
		}

		var req model.AdminBindRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: "bad_json"})
			return
		}
		req.DeviceID = strings.TrimSpace(req.DeviceID)
		if req.UserID <= 0 {
			c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: "user_id_required"})
			return
		}
		if req.DeviceID == "" {
			c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: "device_id_required"})
			return
		}

		var userExists int
		if err := db.Raw(`SELECT 1 FROM mp_users WHERE id = ? LIMIT 1`, req.UserID).Scan(&userExists).Error; err != nil {
			LogReqError(c, "admin_bind", "db_query_failed", err)
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "db_query_failed"})
			return
		}
		if userExists != 1 {
			c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: "user_not_found"})
			return
		}

		var deviceExists int
		if err := db.Raw(`SELECT 1 FROM device_boot_reports WHERE device_id = ? LIMIT 1`, req.DeviceID).Scan(&deviceExists).Error; err != nil {
			LogReqError(c, "admin_bind", "db_query_failed", err)
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "db_query_failed"})
			return
		}
		if deviceExists != 1 {
			c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: "device_not_reported"})
			return
		}

		if err := db.Exec(
			`INSERT INTO mp_user_devices (device_id, user_id, bound_at, updated_at)
			 VALUES (?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))
			 ON DUPLICATE KEY UPDATE
			   user_id = VALUES(user_id),
			   bound_at = UTC_TIMESTAMP(3),
			   updated_at = UTC_TIMESTAMP(3)`,
			req.DeviceID, req.UserID,
		).Error; err != nil {
			LogReqError(c, "admin_bind", "db_exec_failed", err)
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "db_exec_failed"})
			return
		}

		c.JSON(http.StatusOK, model.OkResponse{Ok: true})
	}
}

func AdminUnbind(cfg config.Config, db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !adminTokenOK(c, cfg.AdminToken) {
			return
		}
		if db == nil {
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "mysql_required"})
			return
		}

		var req model.AdminBindRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: "bad_json"})
			return
		}
		req.DeviceID = strings.TrimSpace(req.DeviceID)

		if req.UserID <= 0 && req.DeviceID == "" {
			c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: "missing_params"})
			return
		}

		var err error
		if req.UserID > 0 {
			err = db.Exec(`DELETE FROM mp_user_devices WHERE user_id = ?`, req.UserID).Error
		} else {
			err = db.Exec(`DELETE FROM mp_user_devices WHERE device_id = ?`, req.DeviceID).Error
		}
		if err != nil {
			LogReqError(c, "admin_unbind", "db_exec_failed", err)
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "db_exec_failed"})
			return
		}

		c.JSON(http.StatusOK, model.OkResponse{Ok: true})
	}
}
