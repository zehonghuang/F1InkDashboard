package handlers

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func DeviceUserPrefsKV(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		if db == nil {
			LogReqError(c, "device_user_prefs_kv", "mysql_required", nil)
			c.JSON(http.StatusServiceUnavailable, gin.H{"ok": false, "error": "mysql_required"})
			return
		}

		deviceID := strings.TrimSpace(c.Param("device_id"))
		if deviceID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "device_id_required"})
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
			c.JSON(http.StatusServiceUnavailable, gin.H{"ok": false, "error": "db_query_failed"})
			return
		}

		if r.ID <= 0 {
			c.JSON(http.StatusNotFound, gin.H{"ok": false, "error": "device_not_bound"})
			return
		}

		teamKeys := mpParseStringList(r.TeamKeys)
		if len(teamKeys) == 0 && strings.TrimSpace(r.TeamName) != "" {
			teamKeys = []string{strings.TrimSpace(r.TeamName)}
		}

		c.JSON(http.StatusOK, gin.H{
			"ok":               true,
			"generated_at_utc": time.Now().UTC().Format(time.RFC3339Nano),
			"device_id":        deviceID,
			"kv": gin.H{
				"nick":    emptyToNil(r.NickName),
				"avatar":  emptyToNil(r.AvatarURL),
				"team":    emptyToNil(r.TeamName),
				"teams":   teamKeys,
				"drivers": mpParseDriverNumbers(r.DriverNumbers),
			},
		})
	}
}
