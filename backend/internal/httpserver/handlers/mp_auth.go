package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"log"
	"net/http"
	"strings"
	"time"

	"toinc_f1_backend/internal/config"
	"toinc_f1_backend/internal/wechatmini"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type mpAuthLoginRequest struct {
	Code string `json:"code"`
}

// @Summary 小程序登录
// @Description 使用 wx.login 获取的 code 换取 openid 并返回后端 token。
// @Tags MiniProgramAuth
// @Accept json
// @Produce json
// @Param body body mpAuthLoginRequest true "登录请求"
// @Success 200 {object} MpAuthLoginResponse
// @Failure 400 {object} ErrorResponse
// @Failure 401 {object} ErrorResponse
// @Failure 503 {object} ErrorResponse
// @Router /api/v1/mp/auth/login [post]
func MpAuthLogin(cfg config.Config, db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		if db == nil {
			LogReqError(c, "mp_auth_login", "mysql_required", nil)
			c.JSON(http.StatusServiceUnavailable, gin.H{"ok": false, "error": "mysql_required"})
			return
		}
		if !cfg.WechatMini.Enabled {
			LogReqError(c, "mp_auth_login", "mini_login_disabled", nil)
			c.JSON(http.StatusServiceUnavailable, gin.H{"ok": false, "error": "mini_login_disabled"})
			return
		}

		var req mpAuthLoginRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "bad_json"})
			return
		}
		req.Code = strings.TrimSpace(req.Code)

		if req.Code == "" {
			c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "code_required"})
			return
		}

		client := wechatmini.Client{
			AppID:  cfg.WechatMini.AppID,
			Secret: cfg.WechatMini.Secret,
		}
		sess, err := client.Code2Session(c.Request.Context(), req.Code)
		if err != nil {
			LogReqError(c, "mp_auth_login", "wechat_code2session_failed", err)
			c.JSON(http.StatusUnauthorized, gin.H{"ok": false, "error": "wechat_code2session_failed"})
			return
		}
		log.Printf("mp_auth_login ok openid=%s ip=%s ua=%q", sess.OpenID, c.ClientIP(), c.Request.UserAgent())

		token, err := genTokenHex64()
		if err != nil {
			LogReqError(c, "mp_auth_login", "token_gen_failed", err)
			c.JSON(http.StatusServiceUnavailable, gin.H{"ok": false, "error": "token_gen_failed"})
			return
		}
		expiresAt := time.Now().UTC().Add(30 * 24 * time.Hour)

		var userID int64
		if err := db.Transaction(func(tx *gorm.DB) error {
			var unionid any
			if sess.UnionID != "" {
				unionid = sess.UnionID
			}

			if err := tx.Exec(`
				INSERT INTO mp_users (openid, unionid, created_at, updated_at)
				VALUES (?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))
				ON DUPLICATE KEY UPDATE
					unionid = COALESCE(VALUES(unionid), unionid),
					updated_at = UTC_TIMESTAMP(3)
			`, sess.OpenID, unionid).Error; err != nil {
				return err
			}

			if err := tx.Raw(`SELECT id FROM mp_users WHERE openid = ? LIMIT 1`, sess.OpenID).Scan(&userID).Error; err != nil {
				return err
			}
			if userID <= 0 {
				return gorm.ErrRecordNotFound
			}

			if err := tx.Exec(`
				INSERT INTO mp_sessions (user_id, token, expires_at, created_at, last_seen_at)
				VALUES (?, ?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))
			`, userID, token, expiresAt).Error; err != nil {
				return err
			}

			return nil
		}); err != nil {
			LogReqError(c, "mp_auth_login", "tx_failed", err)
			c.JSON(http.StatusServiceUnavailable, gin.H{"ok": false, "error": "db_exec_failed"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"ok":        true,
			"token":     token,
			"expiresAt": expiresAt.Format(time.RFC3339),
			"user": gin.H{
				"id":     userID,
				"openid": sess.OpenID,
			},
		})
	}
}

type mpAuthBindDeviceRequest struct {
	DeviceID string `json:"device_id"`
}

func MpAuthRequired(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		if db == nil {
			LogReqError(c, "mp_auth_required", "mysql_required", nil)
			c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{"ok": false, "error": "mysql_required"})
			return
		}

		token := strings.TrimSpace(c.GetHeader("Authorization"))
		if strings.HasPrefix(strings.ToLower(token), "bearer ") {
			token = strings.TrimSpace(token[7:])
		}
		if token == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"ok": false, "error": "unauthorized"})
			return
		}

		type row struct {
			UserID int64  `gorm:"column:user_id"`
			OpenID string `gorm:"column:openid"`
		}
		var r row
		if err := db.Raw(`
			SELECT s.user_id AS user_id, u.openid AS openid
			FROM mp_sessions s
			JOIN mp_users u ON u.id = s.user_id
			WHERE s.token = ? AND s.expires_at > UTC_TIMESTAMP(3)
			LIMIT 1
		`, token).Scan(&r).Error; err != nil {
			LogReqError(c, "mp_auth_required", "db_query_failed", err)
			c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{"ok": false, "error": "db_query_failed"})
			return
		}
		if r.UserID <= 0 {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"ok": false, "error": "unauthorized"})
			return
		}

		_ = db.Exec(`UPDATE mp_sessions SET last_seen_at = UTC_TIMESTAMP(3) WHERE token = ?`, token).Error

		c.Set("mp_user_id", r.UserID)
		c.Set("mp_openid", r.OpenID)
		c.Set("mp_token", token)
		c.Next()
	}
}

type mpAuthUpdateProfileRequest struct {
	NickName  string `json:"nick_name"`
	AvatarURL string `json:"avatar_url"`
}

// @Summary 更新用户资料
// @Description nick_name/avatar_url 至少传一个非空。
// @Tags MiniProgramAuth
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param body body mpAuthUpdateProfileRequest true "更新内容"
// @Success 200 {object} OkResponse
// @Failure 400 {object} ErrorResponse
// @Failure 401 {object} ErrorResponse
// @Failure 503 {object} ErrorResponse
// @Router /api/v1/mp/auth/profile [post]
func MpAuthUpdateProfile(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userIDAny, ok := c.Get("mp_user_id")
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"ok": false, "error": "unauthorized"})
			return
		}
		userID, ok := userIDAny.(int64)
		if !ok || userID <= 0 {
			c.JSON(http.StatusUnauthorized, gin.H{"ok": false, "error": "unauthorized"})
			return
		}

		var req mpAuthUpdateProfileRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "bad_json"})
			return
		}
		req.NickName = strings.TrimSpace(req.NickName)
		req.AvatarURL = strings.TrimSpace(req.AvatarURL)

		var nick any
		if req.NickName != "" {
			nick = req.NickName
		}
		var avatar any
		if req.AvatarURL != "" {
			avatar = req.AvatarURL
		}

		if nick == nil && avatar == nil {
			c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "profile_empty"})
			return
		}

		if err := db.Exec(`
			UPDATE mp_users
			SET
				nick_name = COALESCE(?, nick_name),
				avatar_url = COALESCE(?, avatar_url),
				updated_at = UTC_TIMESTAMP(3)
			WHERE id = ?
		`, nick, avatar, userID).Error; err != nil {
			LogReqError(c, "mp_auth_profile", "db_exec_failed", err)
			c.JSON(http.StatusServiceUnavailable, gin.H{"ok": false, "error": "db_exec_failed"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}

// @Summary 上传用户头像
// @Tags MiniProgramAuth
// @Accept mpfd
// @Produce json
// @Security BearerAuth
// @Param avatar formData file true "头像图片文件"
// @Success 200 {object} GenericObject
// @Failure 400 {object} ErrorResponse
// @Failure 401 {object} ErrorResponse
// @Failure 503 {object} ErrorResponse
// @Router /api/v1/mp/auth/avatar [post]
func MpAuthUploadAvatar(staticDir string, db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userIDAny, ok := c.Get("mp_user_id")
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"ok": false, "error": "unauthorized"})
			return
		}
		userID, ok := userIDAny.(int64)
		if !ok || userID <= 0 {
			c.JSON(http.StatusUnauthorized, gin.H{"ok": false, "error": "unauthorized"})
			return
		}
		if db == nil {
			LogReqError(c, "mp_auth_avatar", "mysql_required", nil)
			c.JSON(http.StatusServiceUnavailable, gin.H{"ok": false, "error": "mysql_required"})
			return
		}

		fh, err := c.FormFile("avatar")
		if err != nil || fh == nil {
			c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "avatar_required"})
			return
		}

		url, mime, size, err := saveUploaded(staticDir, "mp_avatar", fh)
		if err != nil {
			LogReqError(c, "mp_auth_avatar", "save_uploaded_failed", err)
			c.JSON(http.StatusServiceUnavailable, gin.H{"ok": false, "error": "save_uploaded_failed"})
			return
		}

		if err := db.Exec(`
			UPDATE mp_users
			SET avatar_url = ?, updated_at = UTC_TIMESTAMP(3)
			WHERE id = ?
		`, url, userID).Error; err != nil {
			LogReqError(c, "mp_auth_avatar", "db_exec_failed", err)
			c.JSON(http.StatusServiceUnavailable, gin.H{"ok": false, "error": "db_exec_failed"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"ok": true, "avatar_url": url, "mime": strings.TrimSpace(mime), "bytes": size})
	}
}

// @Summary 绑定设备
// @Description 绑定前要求设备已调用 /api/v1/device/boot 上报（后端会校验 boot report 存在）。
// @Tags MiniProgramAuth
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param body body mpAuthBindDeviceRequest true "绑定请求"
// @Success 200 {object} GenericObject
// @Failure 400 {object} ErrorResponse
// @Failure 401 {object} ErrorResponse
// @Failure 503 {object} ErrorResponse
// @Router /api/v1/mp/auth/bind_device [post]
func MpAuthBindDevice(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userIDAny, ok := c.Get("mp_user_id")
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"ok": false, "error": "unauthorized"})
			return
		}
		userID, ok := userIDAny.(int64)
		if !ok || userID <= 0 {
			c.JSON(http.StatusUnauthorized, gin.H{"ok": false, "error": "unauthorized"})
			return
		}

		var req mpAuthBindDeviceRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "bad_json"})
			return
		}
		req.DeviceID = strings.TrimSpace(req.DeviceID)
		if req.DeviceID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "device_id_required"})
			return
		}

		var deviceExists int
		if err := db.Raw(`SELECT 1 FROM device_boot_reports WHERE device_id = ? LIMIT 1`, req.DeviceID).Scan(&deviceExists).Error; err != nil {
			LogReqError(c, "mp_auth_bind_device", "db_query_failed", err)
			c.JSON(http.StatusServiceUnavailable, gin.H{"ok": false, "error": "db_query_failed"})
			return
		}
		if deviceExists != 1 {
			c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "device_not_reported"})
			return
		}

		if err := db.Exec(`
			INSERT INTO mp_user_devices (device_id, user_id, bound_at, updated_at)
			VALUES (?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))
			ON DUPLICATE KEY UPDATE
				user_id = VALUES(user_id),
				bound_at = UTC_TIMESTAMP(3),
				updated_at = UTC_TIMESTAMP(3)
		`, req.DeviceID, userID).Error; err != nil {
			LogReqError(c, "mp_auth_bind_device", "db_exec_failed", err)
			c.JSON(http.StatusServiceUnavailable, gin.H{"ok": false, "error": "db_exec_failed"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"ok": true, "device_id": req.DeviceID})
	}
}

// @Summary 获取当前用户信息
// @Tags MiniProgramAuth
// @Produce json
// @Security BearerAuth
// @Success 200 {object} GenericObject
// @Failure 401 {object} ErrorResponse
// @Failure 503 {object} ErrorResponse
// @Router /api/v1/mp/auth/me [get]
func MpAuthMe(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userIDAny, ok := c.Get("mp_user_id")
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"ok": false, "error": "unauthorized"})
			return
		}
		userID, ok := userIDAny.(int64)
		if !ok || userID <= 0 {
			c.JSON(http.StatusUnauthorized, gin.H{"ok": false, "error": "unauthorized"})
			return
		}

		type userRow struct {
			ID        int64  `gorm:"column:id"`
			OpenID    string `gorm:"column:openid"`
			UnionID   string `gorm:"column:unionid"`
			NickName  string `gorm:"column:nick_name"`
			AvatarURL string `gorm:"column:avatar_url"`
		}
		var u userRow
		if err := db.Raw(`SELECT id, openid, unionid, nick_name, avatar_url FROM mp_users WHERE id = ? LIMIT 1`, userID).Scan(&u).Error; err != nil {
			LogReqError(c, "mp_auth_me", "db_query_failed", err)
			c.JSON(http.StatusServiceUnavailable, gin.H{"ok": false, "error": "db_query_failed"})
			return
		}
		if u.ID <= 0 {
			c.JSON(http.StatusUnauthorized, gin.H{"ok": false, "error": "unauthorized"})
			return
		}

		var deviceID string
		_ = db.Raw(`SELECT device_id FROM mp_user_devices WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1`, userID).Scan(&deviceID).Error

		c.JSON(http.StatusOK, gin.H{
			"ok": true,
			"user": gin.H{
				"id":         u.ID,
				"openid":     u.OpenID,
				"unionid":    strings.TrimSpace(u.UnionID),
				"nick_name":  strings.TrimSpace(u.NickName),
				"avatar_url": strings.TrimSpace(u.AvatarURL),
			},
			"device_id": strings.TrimSpace(deviceID),
		})
	}
}

// @Summary 登出
// @Tags MiniProgramAuth
// @Produce json
// @Security BearerAuth
// @Success 200 {object} OkResponse
// @Failure 401 {object} ErrorResponse
// @Router /api/v1/mp/auth/logout [post]
func MpAuthLogout(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		tokenAny, ok := c.Get("mp_token")
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"ok": false, "error": "unauthorized"})
			return
		}
		token, ok := tokenAny.(string)
		if !ok || strings.TrimSpace(token) == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"ok": false, "error": "unauthorized"})
			return
		}

		_ = db.Exec(`DELETE FROM mp_sessions WHERE token = ?`, token).Error
		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}

func genTokenHex64() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
