package handlers

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"toinc_f1_backend/internal/config"
	"toinc_f1_backend/internal/model"

	"github.com/gin-gonic/gin"
)

const wechatGroupConfigSubPath = "mp_config"
const wechatGroupConfigFile = "wechat_group.json"

func wechatGroupConfigPath(staticDir string) string {
	return filepath.Join(staticDir, wechatGroupConfigSubPath, wechatGroupConfigFile)
}

func defaultWechatGroupConfig() model.MpWechatGroupConfig {
	return model.MpWechatGroupConfig{
		Name:    "",
		Hint:    "",
		QrImage: "",
	}
}

func loadWechatGroupConfig(staticDir string) (model.MpWechatGroupConfig, error) {
	p := wechatGroupConfigPath(staticDir)
	data, err := os.ReadFile(p)
	if err != nil {
		if os.IsNotExist(err) {
			return defaultWechatGroupConfig(), nil
		}
		return defaultWechatGroupConfig(), err
	}
	var cfg model.MpWechatGroupConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return defaultWechatGroupConfig(), err
	}
	return cfg, nil
}

func saveWechatGroupConfig(staticDir string, cfg model.MpWechatGroupConfig) error {
	dir := filepath.Join(staticDir, wechatGroupConfigSubPath)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	p := wechatGroupConfigPath(staticDir)
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(p, data, 0o644)
}

func MpWechatGroupGet(staticDir string) gin.HandlerFunc {
	return func(c *gin.Context) {
		cfg, err := loadWechatGroupConfig(staticDir)
		if err != nil {
			LogReqError(c, "mp_wechat_group_get", "load_config_failed", err)
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "load_config_failed"})
			return
		}
		c.JSON(http.StatusOK, model.MpWechatGroupGetResponse{
			Ok:     true,
			Config: cfg,
		})
	}
}

func AdminMpWechatGroupGet(cfg config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !adminTokenOK(c, cfg.AdminToken) {
			return
		}
		gc, err := loadWechatGroupConfig(cfg.StaticDir)
		if err != nil {
			LogReqError(c, "admin_mp_wechat_group_get", "load_config_failed", err)
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "load_config_failed"})
			return
		}
		c.JSON(http.StatusOK, model.MpWechatGroupGetResponse{
			Ok:     true,
			Config: gc,
		})
	}
}

func AdminMpWechatGroupUpdate(cfg config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !adminTokenOK(c, cfg.AdminToken) {
			return
		}
		var req model.MpWechatGroupUpdateRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: "bad_json"})
			return
		}
		gc, err := loadWechatGroupConfig(cfg.StaticDir)
		if err != nil {
			LogReqError(c, "admin_mp_wechat_group_update", "load_config_failed", err)
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "load_config_failed"})
			return
		}
		gc.Name = strings.TrimSpace(req.Name)
		gc.Hint = strings.TrimSpace(req.Hint)
		if err := saveWechatGroupConfig(cfg.StaticDir, gc); err != nil {
			LogReqError(c, "admin_mp_wechat_group_update", "save_config_failed", err)
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "save_config_failed"})
			return
		}
		c.JSON(http.StatusOK, model.MpWechatGroupUpdateResponse{
			Ok:     true,
			Config: gc,
		})
	}
}

func AdminMpWechatGroupUploadQr(cfg config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !adminTokenOK(c, cfg.AdminToken) {
			return
		}
		fh, err := c.FormFile("qr_image")
		if err != nil || fh == nil {
			c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: "qr_image_required"})
			return
		}
		url, mime, size, err := saveUploaded(cfg.StaticDir, "mp_config", fh)
		if err != nil {
			LogReqError(c, "admin_mp_wechat_group_upload_qr", "save_uploaded_failed", err)
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "save_uploaded_failed"})
			return
		}
		gc, err := loadWechatGroupConfig(cfg.StaticDir)
		if err != nil {
			LogReqError(c, "admin_mp_wechat_group_upload_qr", "load_config_failed", err)
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "load_config_failed"})
			return
		}
		gc.QrImage = url
		if err := saveWechatGroupConfig(cfg.StaticDir, gc); err != nil {
			LogReqError(c, "admin_mp_wechat_group_upload_qr", "save_config_failed", err)
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "save_config_failed"})
			return
		}
		c.JSON(http.StatusOK, model.MpWechatGroupUploadQrResponse{
			Ok:      true,
			QrImage: url,
			Mime:    strings.TrimSpace(mime),
			Bytes:   size,
		})
	}
}
