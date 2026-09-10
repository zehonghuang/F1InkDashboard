package handlers

import (
	"encoding/json"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"toinc_f1_backend/internal/config"
	"toinc_f1_backend/internal/model"

	"github.com/gin-gonic/gin"
	_ "golang.org/x/image/webp"
	"gorm.io/gorm"
)

var _ = io.EOF

func posterSaveUploaded(staticDir, subDir string, fh *multipart.FileHeader) (url string, mime string, size int64, fullPath string, err error) {
	ext := safeExtFromFilename(fh.Filename)
	if ext == "" {
		ext = ".bin"
	}
	name := randHex(12) + ext
	dir := filepath.Join(staticDir, subDir)
	if err = os.MkdirAll(dir, 0o755); err != nil {
		return
	}
	fullPath = filepath.Join(dir, name)

	var src multipart.File
	src, err = fh.Open()
	if err != nil {
		return
	}
	defer src.Close()

	var dst *os.File
	dst, err = os.Create(fullPath)
	if err != nil {
		return
	}
	defer dst.Close()

	var wrote int64
	wrote, err = io.Copy(dst, io.LimitReader(src, 8*1024*1024))
	if err != nil {
		_ = os.Remove(fullPath)
		return
	}
	size = wrote
	mime = strings.TrimSpace(fh.Header.Get("Content-Type"))
	if mime == "" {
		switch strings.ToLower(ext) {
		case ".png":
			mime = "image/png"
		case ".jpg", ".jpeg":
			mime = "image/jpeg"
		case ".webp":
			mime = "image/webp"
		case ".gif":
			mime = "image/gif"
		default:
			mime = "application/octet-stream"
		}
	}
	url = "/static/" + subDir + "/" + name
	return
}

func getImageDimensions(fullPath string) (w, h int, err error) {
	f, err := os.Open(fullPath)
	if err != nil {
		return 0, 0, err
	}
	defer f.Close()
	cfg, _, err := image.DecodeConfig(f)
	if err != nil {
		return 0, 0, err
	}
	return cfg.Width, cfg.Height, nil
}

func AdminPosterUploadImage(cfg config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !adminTokenOK(c, cfg.AdminToken) {
			return
		}
		fh, err := c.FormFile("image")
		if err != nil || fh == nil {
			c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: "image_required"})
			return
		}
		url, mime, size, fullPath, err := posterSaveUploaded(cfg.StaticDir, "mp_poster", fh)
		if err != nil {
			LogReqError(c, "admin_poster_upload_image", "save_uploaded_failed", err)
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "save_uploaded_failed"})
			return
		}
		w, h, _ := getImageDimensions(fullPath)
		c.JSON(http.StatusOK, model.MpPosterUploadImageResponse{
			Ok:     true,
			URL:    url,
			Mime:   strings.TrimSpace(mime),
			Bytes:  size,
			Width:  w,
			Height: h,
		})
	}
}

func AdminPosterList(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		if db == nil {
			LogReqError(c, "admin_poster_list", "mysql_required", nil)
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "mysql_required"})
			return
		}
		page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
		pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
		statusStr := c.Query("status")
		if page < 1 {
			page = 1
		}
		if pageSize < 1 {
			pageSize = 20
		}
		if pageSize > 100 {
			pageSize = 100
		}
		q := db.Model(&model.MpPoster{})
		if statusStr != "" {
			q = q.Where("status = ?", statusStr)
		}
		var total int64
		if err := q.Count(&total).Error; err != nil {
			LogReqError(c, "admin_poster_list", "count_failed", err)
			c.JSON(http.StatusInternalServerError, model.ErrorResponse{Ok: false, Error: "query_failed"})
			return
		}
		var items []model.MpPoster
		offset := (page - 1) * pageSize
		if err := q.Order("weight DESC, created_at DESC").Offset(offset).Limit(pageSize).Find(&items).Error; err != nil {
			LogReqError(c, "admin_poster_list", "find_failed", err)
			c.JSON(http.StatusInternalServerError, model.ErrorResponse{Ok: false, Error: "query_failed"})
			return
		}
		c.JSON(http.StatusOK, model.MpPosterListResponse{
			Ok:       true,
			Page:     page,
			PageSize: pageSize,
			Total:    total,
			Items:    items,
		})
	}
}

func AdminPosterDetail(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		if db == nil {
			LogReqError(c, "admin_poster_detail", "mysql_required", nil)
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "mysql_required"})
			return
		}
		id, err := strconv.ParseInt(c.Param("id"), 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: "invalid_id"})
			return
		}
		var item model.MpPoster
		if err := db.First(&item, id).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				c.JSON(http.StatusNotFound, model.ErrorResponse{Ok: false, Error: "not_found"})
				return
			}
			LogReqError(c, "admin_poster_detail", "find_failed", err)
			c.JSON(http.StatusInternalServerError, model.ErrorResponse{Ok: false, Error: "query_failed"})
			return
		}
		c.JSON(http.StatusOK, model.MpPosterDetailResponse{
			Ok:   true,
			Item: item,
		})
	}
}

func AdminPosterCreate(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		if db == nil {
			LogReqError(c, "admin_poster_create", "mysql_required", nil)
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "mysql_required"})
			return
		}
		var req model.MpPosterCreateRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: "bad_json"})
			return
		}
		item := model.MpPoster{
			Title:         strings.TrimSpace(req.Title),
			PosterURL:     strings.TrimSpace(req.PosterURL),
			PosterWidth:   req.PosterWidth,
			PosterHeight:  req.PosterHeight,
			PosterRatio:   req.PosterRatio,
			Status:        req.Status,
			Weight:        req.Weight,
			ContentFormat: req.ContentFormat,
			ContentText:   req.ContentText,
			PublishedAt:   req.PublishedAt,
		}
		if item.ContentFormat == "" {
			item.ContentFormat = "RICH_TEXT_NODES"
		}
		if req.ContentNodes != nil {
			b, _ := json.Marshal(req.ContentNodes)
			item.ContentNodes = string(b)
		}
		if item.Status == "" {
			item.Status = model.MpPosterStatusDraft
		}
		if err := db.Create(&item).Error; err != nil {
			LogReqError(c, "admin_poster_create", "create_failed", err)
			c.JSON(http.StatusInternalServerError, model.ErrorResponse{Ok: false, Error: "create_failed"})
			return
		}
		c.JSON(http.StatusOK, model.MpPosterDetailResponse{
			Ok:   true,
			Item: item,
		})
	}
}

func AdminPosterUpdate(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		if db == nil {
			LogReqError(c, "admin_poster_update", "mysql_required", nil)
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "mysql_required"})
			return
		}
		id, err := strconv.ParseInt(c.Param("id"), 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: "invalid_id"})
			return
		}
		var req model.MpPosterUpdateRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: "bad_json"})
			return
		}
		var item model.MpPoster
		if err := db.First(&item, id).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				c.JSON(http.StatusNotFound, model.ErrorResponse{Ok: false, Error: "not_found"})
				return
			}
			LogReqError(c, "admin_poster_update", "find_failed", err)
			c.JSON(http.StatusInternalServerError, model.ErrorResponse{Ok: false, Error: "query_failed"})
			return
		}
		updates := map[string]any{}
		if req.Title != nil {
			updates["title"] = strings.TrimSpace(*req.Title)
		}
		if req.PosterURL != nil {
			updates["poster_url"] = strings.TrimSpace(*req.PosterURL)
		}
		if req.PosterWidth != nil {
			updates["poster_width"] = *req.PosterWidth
		}
		if req.PosterHeight != nil {
			updates["poster_height"] = *req.PosterHeight
		}
		if req.PosterRatio != nil {
			updates["poster_ratio"] = *req.PosterRatio
		}
		if req.Status != nil {
			updates["status"] = *req.Status
		}
		if req.Weight != nil {
			updates["weight"] = *req.Weight
		}
		if req.ContentFormat != nil {
			updates["content_format"] = *req.ContentFormat
		}
		if req.ContentText != nil {
			updates["content_text"] = *req.ContentText
		}
		if req.ContentNodes != nil {
			b, _ := json.Marshal(*req.ContentNodes)
			updates["content_nodes"] = string(b)
		}
		if req.PublishedAt != nil {
			updates["published_at"] = *req.PublishedAt
		}
		if len(updates) > 0 {
			if err := db.Model(&item).Updates(updates).Error; err != nil {
				LogReqError(c, "admin_poster_update", "update_failed", err)
				c.JSON(http.StatusInternalServerError, model.ErrorResponse{Ok: false, Error: "update_failed"})
				return
			}
			db.First(&item, id)
		}
		c.JSON(http.StatusOK, model.MpPosterDetailResponse{
			Ok:   true,
			Item: item,
		})
	}
}

func AdminPosterDelete(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		if db == nil {
			LogReqError(c, "admin_poster_delete", "mysql_required", nil)
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "mysql_required"})
			return
		}
		id, err := strconv.ParseInt(c.Param("id"), 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: "invalid_id"})
			return
		}
		if err := db.Delete(&model.MpPoster{}, id).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				c.JSON(http.StatusNotFound, model.ErrorResponse{Ok: false, Error: "not_found"})
				return
			}
			LogReqError(c, "admin_poster_delete", "delete_failed", err)
			c.JSON(http.StatusInternalServerError, model.ErrorResponse{Ok: false, Error: "delete_failed"})
			return
		}
		c.JSON(http.StatusOK, model.OkResponse{Ok: true})
	}
}

func MpPosterGet(db *gorm.DB, cfg config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		baseURL := ""
		if db == nil {
			c.JSON(http.StatusOK, model.MpMpPosterResponse{
				Ok:      true,
				BaseURL: baseURL,
			})
			return
		}
		var item model.MpPoster
		err := db.Where("status = ?", model.MpPosterStatusPublished).
			Order("weight DESC, created_at DESC").
			Limit(1).
			First(&item).Error
		if err != nil {
			if err == gorm.ErrRecordNotFound {
				c.JSON(http.StatusOK, model.MpMpPosterResponse{
					Ok:      true,
					BaseURL: baseURL,
				})
				return
			}
			LogReqError(c, "mp_poster_get", "query_failed", err)
			c.JSON(http.StatusOK, model.MpMpPosterResponse{
				Ok:      true,
				BaseURL: baseURL,
			})
			return
		}
		c.JSON(http.StatusOK, model.MpMpPosterResponse{
			Ok:      true,
			BaseURL: baseURL,
			Item:    &item,
		})
	}
}
