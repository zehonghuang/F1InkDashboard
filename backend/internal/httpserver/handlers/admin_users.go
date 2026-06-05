package handlers

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"toinc_f1_backend/internal/config"
	"toinc_f1_backend/internal/model"
)

func AdminUsersList(cfg config.Config, db *gorm.DB) gin.HandlerFunc {
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
			whereParts = append(whereParts, "(LOWER(u.openid) LIKE ? OR LOWER(u.unionid) LIKE ? OR LOWER(u.nick_name) LIKE ?)")
			whereArgs = append(whereArgs, like, like, like)
		}
		whereSQL := strings.Join(whereParts, " AND ")

		type countRow struct {
			Total int `gorm:"column:total"`
		}
		var cr countRow
		if err := db.Raw("SELECT COUNT(*) AS total FROM mp_users u WHERE "+whereSQL, whereArgs...).Scan(&cr).Error; err != nil {
			LogReqError(c, "admin_users_list", "db_count_failed", err)
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "db_query_failed"})
			return
		}

		start := (page - 1) * pageSize
		if start < 0 {
			start = 0
		}

		type row struct {
			ID        int64      `gorm:"column:id"`
			OpenID    string     `gorm:"column:openid"`
			UnionID   *string    `gorm:"column:unionid"`
			NickName  *string    `gorm:"column:nick_name"`
			AvatarURL *string    `gorm:"column:avatar_url"`
			CreatedAt *time.Time `gorm:"column:created_at"`
			UpdatedAt *time.Time `gorm:"column:updated_at"`
			DeviceID  *string    `gorm:"column:device_id"`
			BoardType *string    `gorm:"column:board_type"`
			FwUA      *string    `gorm:"column:fw_user_agent"`
			LastSeen  *time.Time `gorm:"column:last_seen_at"`
		}
		var rows []row
		args := append([]any{}, whereArgs...)
		args = append(args, pageSize, start)
		if err := db.Raw(
			`SELECT u.id, u.openid, u.unionid, u.nick_name, u.avatar_url, u.created_at, u.updated_at,
			        ud.device_id AS device_id,
			        d.board_type AS board_type, d.fw_user_agent AS fw_user_agent, d.last_seen_at AS last_seen_at
			 FROM mp_users u
			 LEFT JOIN mp_user_devices ud ON ud.user_id = u.id
			 LEFT JOIN device_boot_reports d ON d.device_id = ud.device_id
			 WHERE `+whereSQL+`
			 ORDER BY u.updated_at DESC, u.id DESC
			 LIMIT ? OFFSET ?`,
			args...,
		).Scan(&rows).Error; err != nil {
			LogReqError(c, "admin_users_list", "db_list_failed", err)
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "db_query_failed"})
			return
		}

		out := make([]model.AdminUserItem, 0, len(rows))
		for _, r := range rows {
			it := model.AdminUserItem{
				ID:        r.ID,
				OpenID:    strings.TrimSpace(r.OpenID),
				UnionID:   strings.TrimSpace(ptrStr(r.UnionID)),
				NickName:  strings.TrimSpace(ptrStr(r.NickName)),
				AvatarURL: strings.TrimSpace(ptrStr(r.AvatarURL)),
				CreatedAt: formatTimePtr(r.CreatedAt),
				UpdatedAt: formatTimePtr(r.UpdatedAt),
			}
			if s := strings.TrimSpace(ptrStr(r.DeviceID)); s != "" {
				it.Device = &model.AdminDeviceBrief{
					DeviceID:    s,
					BoardType:   strings.TrimSpace(ptrStr(r.BoardType)),
					FwUserAgent: strings.TrimSpace(ptrStr(r.FwUA)),
					LastSeenAt:  formatTimePtr(r.LastSeen),
				}
			}
			out = append(out, it)
		}

		c.JSON(http.StatusOK, model.AdminUsersListResponse{
			Ok:       true,
			Page:     page,
			PageSize: pageSize,
			Total:    cr.Total,
			Items:    out,
		})
	}
}

func AdminUserDetail(cfg config.Config, db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !adminTokenOK(c, cfg.AdminToken) {
			return
		}
		if db == nil {
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "mysql_required"})
			return
		}

		idStr := strings.TrimSpace(c.Param("user_id"))
		if idStr == "" {
			c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: "user_id_required"})
			return
		}
		id, err := strconv.ParseInt(idStr, 10, 64)
		if err != nil || id <= 0 {
			c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: "bad_user_id"})
			return
		}

		type row struct {
			ID        int64      `gorm:"column:id"`
			OpenID    string     `gorm:"column:openid"`
			UnionID   *string    `gorm:"column:unionid"`
			NickName  *string    `gorm:"column:nick_name"`
			AvatarURL *string    `gorm:"column:avatar_url"`
			CreatedAt *time.Time `gorm:"column:created_at"`
			UpdatedAt *time.Time `gorm:"column:updated_at"`
			DeviceID  *string    `gorm:"column:device_id"`
			BoardType *string    `gorm:"column:board_type"`
			FwUA      *string    `gorm:"column:fw_user_agent"`
			LastSeen  *time.Time `gorm:"column:last_seen_at"`
		}
		var rows []row
		if err := db.Raw(
			`SELECT u.id, u.openid, u.unionid, u.nick_name, u.avatar_url, u.created_at, u.updated_at,
			        ud.device_id AS device_id,
			        d.board_type AS board_type, d.fw_user_agent AS fw_user_agent, d.last_seen_at AS last_seen_at
			 FROM mp_users u
			 LEFT JOIN mp_user_devices ud ON ud.user_id = u.id
			 LEFT JOIN device_boot_reports d ON d.device_id = ud.device_id
			 WHERE u.id = ?
			 LIMIT 1`,
			id,
		).Scan(&rows).Error; err != nil {
			LogReqError(c, "admin_user_detail", "db_get_failed", err)
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "db_query_failed"})
			return
		}
		if len(rows) == 0 || rows[0].ID <= 0 {
			c.JSON(http.StatusNotFound, model.ErrorResponse{Ok: false, Error: "not_found"})
			return
		}
		r := rows[0]

		it := model.AdminUserItem{
			ID:        r.ID,
			OpenID:    strings.TrimSpace(r.OpenID),
			UnionID:   strings.TrimSpace(ptrStr(r.UnionID)),
			NickName:  strings.TrimSpace(ptrStr(r.NickName)),
			AvatarURL: strings.TrimSpace(ptrStr(r.AvatarURL)),
			CreatedAt: formatTimePtr(r.CreatedAt),
			UpdatedAt: formatTimePtr(r.UpdatedAt),
		}
		if s := strings.TrimSpace(ptrStr(r.DeviceID)); s != "" {
			it.Device = &model.AdminDeviceBrief{
				DeviceID:    s,
				BoardType:   strings.TrimSpace(ptrStr(r.BoardType)),
				FwUserAgent: strings.TrimSpace(ptrStr(r.FwUA)),
				LastSeenAt:  formatTimePtr(r.LastSeen),
			}
		}

		c.JSON(http.StatusOK, model.AdminUserDetailResponse{Ok: true, Item: it})
	}
}
