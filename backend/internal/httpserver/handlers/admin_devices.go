package handlers

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"toinc_f1_backend/internal/config"
	"toinc_f1_backend/internal/model"
)

func AdminDevicesList(cfg config.Config, db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !adminTokenOK(c, cfg.AdminToken) {
			return
		}
		if db == nil {
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "mysql_required"})
			return
		}

		page := toIntQuery(c, "page", 1)
		if page < 1 {
			page = 1
		}
		pageSize := toIntQuery(c, "page_size", 20)
		if pageSize < 1 {
			pageSize = 1
		}
		if pageSize > 100 {
			pageSize = 100
		}
		q := strings.TrimSpace(c.Query("q"))

		whereParts := []string{"1=1"}
		whereArgs := []any{}
		if q != "" {
			like := "%" + strings.ToLower(q) + "%"
			whereParts = append(whereParts, "(LOWER(d.device_id) LIKE ? OR LOWER(d.mac) LIKE ? OR LOWER(d.board_type) LIKE ? OR LOWER(d.fw_user_agent) LIKE ?)")
			whereArgs = append(whereArgs, like, like, like, like)
		}
		whereSQL := strings.Join(whereParts, " AND ")

		type countRow struct {
			Total int `gorm:"column:total"`
		}
		var cr countRow
		if err := db.Raw("SELECT COUNT(*) AS total FROM device_boot_reports d WHERE "+whereSQL, whereArgs...).Scan(&cr).Error; err != nil {
			LogReqError(c, "admin_devices_list", "db_count_failed", err)
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "db_query_failed"})
			return
		}

		start := (page - 1) * pageSize
		if start < 0 {
			start = 0
		}

		type row struct {
			DeviceID    string     `gorm:"column:device_id"`
			DeviceUUID  *string    `gorm:"column:device_uuid"`
			DeviceKey   *string    `gorm:"column:device_key"`
			Mac         *string    `gorm:"column:mac"`
			BoardType   *string    `gorm:"column:board_type"`
			FwUserAgent *string    `gorm:"column:fw_user_agent"`
			FirstSeenAt *time.Time `gorm:"column:first_seen_at"`
			LastSeenAt  *time.Time `gorm:"column:last_seen_at"`
			UserID      *int64     `gorm:"column:user_id"`
			OpenID      *string    `gorm:"column:openid"`
			NickName    *string    `gorm:"column:nick_name"`
			AvatarURL   *string    `gorm:"column:avatar_url"`
		}
		var rows []row
		args := append([]any{}, whereArgs...)
		args = append(args, pageSize, start)
		if err := db.Raw(
			`SELECT d.device_id, d.device_uuid, d.device_key, d.mac, d.board_type, d.fw_user_agent, d.first_seen_at, d.last_seen_at,
			        ud.user_id AS user_id, u.openid AS openid, u.nick_name AS nick_name, u.avatar_url AS avatar_url
			 FROM device_boot_reports d
			 LEFT JOIN mp_user_devices ud ON ud.device_id = d.device_id
			 LEFT JOIN mp_users u ON u.id = ud.user_id
			 WHERE `+whereSQL+`
			 ORDER BY d.last_seen_at DESC, d.first_seen_at DESC, d.device_id ASC
			 LIMIT ? OFFSET ?`,
			args...,
		).Scan(&rows).Error; err != nil {
			LogReqError(c, "admin_devices_list", "db_list_failed", err)
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "db_query_failed"})
			return
		}

		out := make([]model.AdminDeviceItem, 0, len(rows))
		for _, r := range rows {
			it := model.AdminDeviceItem{
				DeviceID:    strings.TrimSpace(r.DeviceID),
				DeviceUUID:  strings.TrimSpace(ptrStr(r.DeviceUUID)),
				DeviceKey:   strings.TrimSpace(ptrStr(r.DeviceKey)),
				Mac:         strings.TrimSpace(ptrStr(r.Mac)),
				BoardType:   strings.TrimSpace(ptrStr(r.BoardType)),
				FwUserAgent: strings.TrimSpace(ptrStr(r.FwUserAgent)),
				FirstSeenAt: formatTimePtr(r.FirstSeenAt),
				LastSeenAt:  formatTimePtr(r.LastSeenAt),
			}
			if r.UserID != nil && *r.UserID > 0 {
				it.BoundUser = &model.AdminUserBrief{
					ID:        *r.UserID,
					OpenID:    strings.TrimSpace(ptrStr(r.OpenID)),
					NickName:  strings.TrimSpace(ptrStr(r.NickName)),
					AvatarURL: strings.TrimSpace(ptrStr(r.AvatarURL)),
				}
			}
			out = append(out, it)
		}

		c.JSON(http.StatusOK, model.AdminDevicesListResponse{
			Ok:       true,
			Page:     page,
			PageSize: pageSize,
			Total:    cr.Total,
			Items:    out,
		})
	}
}

func AdminDeviceDetail(cfg config.Config, db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !adminTokenOK(c, cfg.AdminToken) {
			return
		}
		if db == nil {
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "mysql_required"})
			return
		}

		deviceID := strings.TrimSpace(c.Param("device_id"))
		if deviceID == "" {
			c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: "device_id_required"})
			return
		}

		type row struct {
			DeviceID    string     `gorm:"column:device_id"`
			DeviceUUID  *string    `gorm:"column:device_uuid"`
			DeviceKey   *string    `gorm:"column:device_key"`
			Mac         *string    `gorm:"column:mac"`
			BoardType   *string    `gorm:"column:board_type"`
			FwUserAgent *string    `gorm:"column:fw_user_agent"`
			FirstSeenAt *time.Time `gorm:"column:first_seen_at"`
			LastSeenAt  *time.Time `gorm:"column:last_seen_at"`
			UserID      *int64     `gorm:"column:user_id"`
			OpenID      *string    `gorm:"column:openid"`
			NickName    *string    `gorm:"column:nick_name"`
			AvatarURL   *string    `gorm:"column:avatar_url"`
		}
		var rows []row
		if err := db.Raw(
			`SELECT d.device_id, d.device_uuid, d.device_key, d.mac, d.board_type, d.fw_user_agent, d.first_seen_at, d.last_seen_at,
			        ud.user_id AS user_id, u.openid AS openid, u.nick_name AS nick_name, u.avatar_url AS avatar_url
			 FROM device_boot_reports d
			 LEFT JOIN mp_user_devices ud ON ud.device_id = d.device_id
			 LEFT JOIN mp_users u ON u.id = ud.user_id
			 WHERE d.device_id = ?
			 LIMIT 1`,
			deviceID,
		).Scan(&rows).Error; err != nil {
			LogReqError(c, "admin_device_detail", "db_get_failed", err)
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "db_query_failed"})
			return
		}
		if len(rows) == 0 || strings.TrimSpace(rows[0].DeviceID) == "" {
			c.JSON(http.StatusNotFound, model.ErrorResponse{Ok: false, Error: "not_found"})
			return
		}
		r := rows[0]

		it := model.AdminDeviceItem{
			DeviceID:    strings.TrimSpace(r.DeviceID),
			DeviceUUID:  strings.TrimSpace(ptrStr(r.DeviceUUID)),
			DeviceKey:   strings.TrimSpace(ptrStr(r.DeviceKey)),
			Mac:         strings.TrimSpace(ptrStr(r.Mac)),
			BoardType:   strings.TrimSpace(ptrStr(r.BoardType)),
			FwUserAgent: strings.TrimSpace(ptrStr(r.FwUserAgent)),
			FirstSeenAt: formatTimePtr(r.FirstSeenAt),
			LastSeenAt:  formatTimePtr(r.LastSeenAt),
		}
		if r.UserID != nil && *r.UserID > 0 {
			it.BoundUser = &model.AdminUserBrief{
				ID:        *r.UserID,
				OpenID:    strings.TrimSpace(ptrStr(r.OpenID)),
				NickName:  strings.TrimSpace(ptrStr(r.NickName)),
				AvatarURL: strings.TrimSpace(ptrStr(r.AvatarURL)),
			}
		}

		c.JSON(http.StatusOK, model.AdminDeviceDetailResponse{Ok: true, Item: it})
	}
}

func ptrStr(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

func formatTimePtr(t *time.Time) string {
	if t == nil {
		return ""
	}
	return t.UTC().Format(time.RFC3339Nano)
}
