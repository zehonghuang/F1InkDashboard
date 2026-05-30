package handlers

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type deviceBootRequest struct {
	DeviceID    string `json:"device_id"`
	DeviceUUID  string `json:"device_uuid"`
	DeviceKey   string `json:"device_key"`
	Mac         string `json:"mac"`
	BoardType   string `json:"board_type"`
	FwUserAgent string `json:"fw_user_agent"`
}

// @Summary 设备启动上报
// @Description 设备开机后上报自身信息，用于记录 boot report，并作为后续绑定校验依据。
// @Tags Device
// @Accept json
// @Produce json
// @Param body body deviceBootRequest true "设备启动信息"
// @Success 200 {object} OkResponse
// @Failure 400 {object} ErrorResponse
// @Failure 503 {object} ErrorResponse
// @Router /api/v1/device/boot [post]
func DeviceBoot(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		if db == nil {
			LogReqError(c, "device_boot", "mysql_required", nil)
			c.JSON(http.StatusServiceUnavailable, gin.H{"ok": false, "error": "mysql_required"})
			return
		}

		var req deviceBootRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "bad_json"})
			return
		}

		req.DeviceID = strings.TrimSpace(req.DeviceID)
		req.DeviceUUID = strings.TrimSpace(req.DeviceUUID)
		req.DeviceKey = strings.TrimSpace(req.DeviceKey)
		req.Mac = strings.TrimSpace(req.Mac)
		req.BoardType = strings.TrimSpace(req.BoardType)
		req.FwUserAgent = strings.TrimSpace(req.FwUserAgent)

		if req.DeviceID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "device_id_required"})
			return
		}

		var deviceUUID any
		if req.DeviceUUID != "" {
			deviceUUID = req.DeviceUUID
		}
		var deviceKey any
		if req.DeviceKey != "" {
			deviceKey = req.DeviceKey
		}
		var mac any
		if req.Mac != "" {
			mac = req.Mac
		}
		var boardType any
		if req.BoardType != "" {
			boardType = req.BoardType
		}
		var fwUserAgent any
		if req.FwUserAgent != "" {
			fwUserAgent = req.FwUserAgent
		}

		if err := db.Exec(`
			INSERT INTO device_boot_reports (
				device_id,
				device_uuid,
				device_key,
				mac,
				board_type,
				fw_user_agent,
				first_seen_at,
				last_seen_at
			) VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))
			ON DUPLICATE KEY UPDATE
				device_uuid = COALESCE(VALUES(device_uuid), device_uuid),
				device_key = COALESCE(VALUES(device_key), device_key),
				mac = COALESCE(VALUES(mac), mac),
				board_type = COALESCE(VALUES(board_type), board_type),
				fw_user_agent = COALESCE(VALUES(fw_user_agent), fw_user_agent),
				last_seen_at = UTC_TIMESTAMP(3)
		`, req.DeviceID, deviceUUID, deviceKey, mac, boardType, fwUserAgent).Error; err != nil {
			LogReqError(c, "device_boot", "db_exec_failed", err)
			c.JSON(http.StatusServiceUnavailable, gin.H{"ok": false, "error": "db_exec_failed"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}
