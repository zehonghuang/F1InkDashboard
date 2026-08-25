package service

import (
	"toinc_f1_backend/internal/model"

	"gorm.io/gorm"
)

type ActivityService struct {
	db *gorm.DB
}

func NewActivityService(db *gorm.DB) *ActivityService {
	return &ActivityService{db: db}
}

func (s *ActivityService) List(page, pageSize int, status *model.ActivityStatus) (*model.ActivityListResponse, error) {
	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 {
		pageSize = 20
	}

	query := s.db.Model(&model.Activity{})
	if status != nil {
		query = query.Where("status = ?", *status)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, err
	}

	var items []model.Activity
	offset := (page - 1) * pageSize
	if err := query.Order("created_at DESC").Offset(offset).Limit(pageSize).Find(&items).Error; err != nil {
		return nil, err
	}

	return &model.ActivityListResponse{
		Ok:       true,
		Page:     page,
		PageSize: pageSize,
		Total:    total,
		Items:    items,
	}, nil
}

func (s *ActivityService) GetByID(id int64) (*model.ActivityDetailResponse, error) {
	var item model.Activity
	if err := s.db.First(&item, id).Error; err != nil {
		return nil, err
	}
	return &model.ActivityDetailResponse{
		Ok:   true,
		Item: item,
	}, nil
}

func (s *ActivityService) Create(req *model.ActivityCreateRequest) (*model.ActivityDetailResponse, error) {
	item := model.Activity{
		Title:       req.Title,
		Description: req.Description,
		CoverURL:    req.CoverURL,
		Status:      req.Status,
		StartTime:   req.StartTime,
		EndTime:     req.EndTime,
	}
	if item.Status == "" {
		item.Status = model.ActivityStatusDraft
	}
	if err := s.db.Create(&item).Error; err != nil {
		return nil, err
	}
	return &model.ActivityDetailResponse{
		Ok:   true,
		Item: item,
	}, nil
}

func (s *ActivityService) Update(id int64, req *model.ActivityUpdateRequest) (*model.ActivityDetailResponse, error) {
	var item model.Activity
	if err := s.db.First(&item, id).Error; err != nil {
		return nil, err
	}

	updates := map[string]interface{}{}
	if req.Title != nil {
		updates["title"] = *req.Title
	}
	if req.Description != nil {
		updates["description"] = *req.Description
	}
	if req.CoverURL != nil {
		updates["cover_url"] = *req.CoverURL
	}
	if req.Status != nil {
		updates["status"] = *req.Status
	}
	if req.StartTime != nil {
		updates["start_time"] = *req.StartTime
	}
	if req.EndTime != nil {
		updates["end_time"] = *req.EndTime
	}

	if len(updates) > 0 {
		if err := s.db.Model(&item).Updates(updates).Error; err != nil {
			return nil, err
		}
		if err := s.db.First(&item, id).Error; err != nil {
			return nil, err
		}
	}

	return &model.ActivityDetailResponse{
		Ok:   true,
		Item: item,
	}, nil
}

func (s *ActivityService) Delete(id int64) error {
	return s.db.Delete(&model.Activity{}, id).Error
}
