package handlers

import (
	"net/http"
	"strconv"

	"toinc_f1_backend/internal/model"
	"toinc_f1_backend/internal/service"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// @Summary 获取活动列表
// @Description 分页获取活动列表，可按状态筛选
// @Tags Activity
// @Produce json
// @Param page query int false "页码，默认1"
// @Param page_size query int false "每页数量，默认20"
// @Param status query string false "状态筛选：draft/published/ended"
// @Success 200 {object} model.ActivityListResponse
// @Failure 400 {object} model.ErrorResponse
// @Failure 503 {object} model.ErrorResponse
// @Router /api/v1/admin/activities [get]
func AdminActivityList(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		if db == nil {
			LogReqError(c, "admin_activity_list", "mysql_required", nil)
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "mysql_required"})
			return
		}

		page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
		pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
		statusStr := c.Query("status")

		var status *model.ActivityStatus
		if statusStr != "" {
			s := model.ActivityStatus(statusStr)
			status = &s
		}

		svc := service.NewActivityService(db)
		resp, err := svc.List(page, pageSize, status)
		if err != nil {
			LogReqError(c, "admin_activity_list", "query_failed", err)
			c.JSON(http.StatusInternalServerError, model.ErrorResponse{Ok: false, Error: "query_failed"})
			return
		}
		c.JSON(http.StatusOK, resp)
	}
}

// @Summary 获取活动详情
// @Description 根据 ID 获取活动详情
// @Tags Activity
// @Produce json
// @Param id path int true "活动 ID"
// @Success 200 {object} model.ActivityDetailResponse
// @Failure 404 {object} model.ErrorResponse
// @Failure 503 {object} model.ErrorResponse
// @Router /api/v1/admin/activities/{id} [get]
func AdminActivityDetail(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		if db == nil {
			LogReqError(c, "admin_activity_detail", "mysql_required", nil)
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "mysql_required"})
			return
		}

		id, err := strconv.ParseInt(c.Param("id"), 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: "invalid_id"})
			return
		}

		svc := service.NewActivityService(db)
		resp, err := svc.GetByID(id)
		if err != nil {
			if err == gorm.ErrRecordNotFound {
				c.JSON(http.StatusNotFound, model.ErrorResponse{Ok: false, Error: "not_found"})
				return
			}
			LogReqError(c, "admin_activity_detail", "query_failed", err)
			c.JSON(http.StatusInternalServerError, model.ErrorResponse{Ok: false, Error: "query_failed"})
			return
		}
		c.JSON(http.StatusOK, resp)
	}
}

// @Summary 创建活动
// @Description 创建新活动
// @Tags Activity
// @Accept json
// @Produce json
// @Param body body model.ActivityCreateRequest true "活动信息"
// @Success 200 {object} model.ActivityDetailResponse
// @Failure 400 {object} model.ErrorResponse
// @Failure 503 {object} model.ErrorResponse
// @Router /api/v1/admin/activities [post]
func AdminActivityCreate(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		if db == nil {
			LogReqError(c, "admin_activity_create", "mysql_required", nil)
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "mysql_required"})
			return
		}

		var req model.ActivityCreateRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: "bad_json"})
			return
		}

		svc := service.NewActivityService(db)
		resp, err := svc.Create(&req)
		if err != nil {
			LogReqError(c, "admin_activity_create", "create_failed", err)
			c.JSON(http.StatusInternalServerError, model.ErrorResponse{Ok: false, Error: "create_failed"})
			return
		}
		c.JSON(http.StatusOK, resp)
	}
}

// @Summary 更新活动
// @Description 更新指定活动信息
// @Tags Activity
// @Accept json
// @Produce json
// @Param id path int true "活动 ID"
// @Param body body model.ActivityUpdateRequest true "更新内容"
// @Success 200 {object} model.ActivityDetailResponse
// @Failure 400 {object} model.ErrorResponse
// @Failure 404 {object} model.ErrorResponse
// @Failure 503 {object} model.ErrorResponse
// @Router /api/v1/admin/activities/{id} [put]
func AdminActivityUpdate(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		if db == nil {
			LogReqError(c, "admin_activity_update", "mysql_required", nil)
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "mysql_required"})
			return
		}

		id, err := strconv.ParseInt(c.Param("id"), 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: "invalid_id"})
			return
		}

		var req model.ActivityUpdateRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: "bad_json"})
			return
		}

		svc := service.NewActivityService(db)
		resp, err := svc.Update(id, &req)
		if err != nil {
			if err == gorm.ErrRecordNotFound {
				c.JSON(http.StatusNotFound, model.ErrorResponse{Ok: false, Error: "not_found"})
				return
			}
			LogReqError(c, "admin_activity_update", "update_failed", err)
			c.JSON(http.StatusInternalServerError, model.ErrorResponse{Ok: false, Error: "update_failed"})
			return
		}
		c.JSON(http.StatusOK, resp)
	}
}

// @Summary 删除活动
// @Description 删除指定活动
// @Tags Activity
// @Produce json
// @Param id path int true "活动 ID"
// @Success 200 {object} model.OkResponse
// @Failure 400 {object} model.ErrorResponse
// @Failure 404 {object} model.ErrorResponse
// @Failure 503 {object} model.ErrorResponse
// @Router /api/v1/admin/activities/{id} [delete]
func AdminActivityDelete(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		if db == nil {
			LogReqError(c, "admin_activity_delete", "mysql_required", nil)
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "mysql_required"})
			return
		}

		id, err := strconv.ParseInt(c.Param("id"), 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, model.ErrorResponse{Ok: false, Error: "invalid_id"})
			return
		}

		svc := service.NewActivityService(db)
		if err := svc.Delete(id); err != nil {
			if err == gorm.ErrRecordNotFound {
				c.JSON(http.StatusNotFound, model.ErrorResponse{Ok: false, Error: "not_found"})
				return
			}
			LogReqError(c, "admin_activity_delete", "delete_failed", err)
			c.JSON(http.StatusInternalServerError, model.ErrorResponse{Ok: false, Error: "delete_failed"})
			return
		}
		c.JSON(http.StatusOK, model.OkResponse{Ok: true})
	}
}
