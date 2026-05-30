package handlers

import (
	"net/http"
	"strings"
	"time"

	"toinc_f1_backend/internal/model"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// @Summary 获取设备绑定用户偏好 KV
// @Description 返回该 device_id 绑定用户的偏好（nick/avatar/team/teams/drivers）。
// @Tags Device
// @Produce json
// @Param device_id path string true "设备 ID"
// @Success 200 {object} model.DeviceUserPrefsKVResponse
// @Failure 400 {object} model.ErrorResponse
// @Failure 404 {object} model.ErrorResponse
// @Failure 503 {object} model.ErrorResponse
// @Router /api/v1/device/{device_id}/user_prefs_kv [get]
func DeviceUserPrefsKV(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		if db == nil {
			LogReqError(c, "device_user_prefs_kv", "mysql_required", nil)
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "mysql_required"})
			return
		}

		deviceID := strings.TrimSpace(c.Param("device_id"))
		if deviceID == "" {
			c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: "device_id_required"})
			return
		}

		type row struct {
			ID            int64  `gorm:"column:id"`
			NickName      string `gorm:"column:nick_name"`
			AvatarURL     string `gorm:"column:avatar_url"`
			TeamName      string `gorm:"column:preferred_team_name"`
			TeamKeys      string `gorm:"column:preferred_team_keys"`
			DriverNumbers string `gorm:"column:preferred_driver_numbers"`
		}
		var r row
		if err := db.Raw(`
			SELECT
				u.id,
				u.nick_name,
				u.avatar_url,
				u.preferred_team_name,
				u.preferred_team_keys,
				u.preferred_driver_numbers
			FROM mp_user_devices d
			JOIN mp_users u ON u.id = d.user_id
			WHERE d.device_id = ?
			LIMIT 1
		`, deviceID).Scan(&r).Error; err != nil {
			LogReqError(c, "device_user_prefs_kv", "db_query_failed", err)
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "db_query_failed"})
			return
		}

		if r.ID <= 0 {
			c.JSON(http.StatusNotFound, model.ErrorResponse{Ok: false, Error: "device_not_bound"})
			return
		}

		teamKeys := mpParseStringList(r.TeamKeys)
		if len(teamKeys) == 0 && strings.TrimSpace(r.TeamName) != "" {
			teamKeys = []string{strings.TrimSpace(r.TeamName)}
		}

		nick := strings.TrimSpace(r.NickName)
		var nickPtr *string
		if nick != "" {
			nickPtr = &nick
		}
		avatar := strings.TrimSpace(r.AvatarURL)
		var avatarPtr *string
		if avatar != "" {
			avatarPtr = &avatar
		}
		team := strings.TrimSpace(r.TeamName)
		var teamPtr *string
		if team != "" {
			teamPtr = &team
		}

		c.JSON(http.StatusOK, model.DeviceUserPrefsKVResponse{
			Ok:             true,
			GeneratedAtUTC: time.Now().UTC().Format(time.RFC3339Nano),
			DeviceID:       deviceID,
			KV: model.DeviceUserPrefsKV{
				Nick:    nickPtr,
				Avatar:  avatarPtr,
				Team:    teamPtr,
				Teams:   teamKeys,
				Drivers: mpParseDriverNumbers(r.DriverNumbers),
			},
		})
	}
}
