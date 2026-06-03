package handlers

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"time"

	"toinc_f1_backend/internal/model"
)

var errMpNewsNotFound = errors.New("mp_news_not_found")

func mpNewsLess(a, b model.MpNewsItem) bool {
	if a.Pinned != b.Pinned {
		return a.Pinned
	}
	if a.Weight != b.Weight {
		return a.Weight > b.Weight
	}
	at, _ := time.Parse(time.RFC3339, a.PublishedAt)
	bt, _ := time.Parse(time.RFC3339, b.PublishedAt)
	return at.After(bt)
}

func mpNewsIndexPath(staticDir string) string {
	return filepath.Join(staticDir, "mp_news", "index.json")
}

func mpNewsItemPath(staticDir, id string) string {
	return filepath.Join(staticDir, "mp_news", "items", id+".json")
}

func mpNewsSafeID(id string) bool {
	if id == "" {
		return false
	}
	for _, r := range id {
		if r >= 'a' && r <= 'z' {
			continue
		}
		if r >= 'A' && r <= 'Z' {
			continue
		}
		if r >= '0' && r <= '9' {
			continue
		}
		if r == '_' || r == '-' {
			continue
		}
		return false
	}
	return true
}

func mpNewsLoadIndex(staticDir string, now time.Time) ([]model.MpNewsItem, error) {
	staticDir = strings.TrimSpace(staticDir)
	if staticDir == "" {
		return []model.MpNewsItem{}, nil
	}
	p := mpNewsIndexPath(staticDir)
	b, err := os.ReadFile(p)
	if err != nil {
		if os.IsNotExist(err) {
			return []model.MpNewsItem{}, nil
		}
		return nil, err
	}
	var items []model.MpNewsItem
	if err := json.Unmarshal(b, &items); err != nil {
		return nil, err
	}
	for i := range items {
		items[i].TimeText = mpRelativeTime(items[i].PublishedAt, now)
	}
	for i := 0; i < len(items)-1; i++ {
		for j := i + 1; j < len(items); j++ {
			if mpNewsLess(items[i], items[j]) {
				continue
			}
			items[i], items[j] = items[j], items[i]
		}
	}
	return items, nil
}

func mpNewsLoadItem(staticDir, id string, now time.Time) (*model.MpNewsItem, error) {
	staticDir = strings.TrimSpace(staticDir)
	id = strings.TrimSpace(id)
	if staticDir == "" || id == "" {
		return nil, errMpNewsNotFound
	}
	if !mpNewsSafeID(id) {
		return nil, errMpNewsNotFound
	}
	p := mpNewsItemPath(staticDir, id)
	b, err := os.ReadFile(p)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, errMpNewsNotFound
		}
		return nil, err
	}
	var it model.MpNewsItem
	if err := json.Unmarshal(b, &it); err != nil {
		return nil, err
	}
	it.TimeText = mpRelativeTime(it.PublishedAt, now)
	return &it, nil
}
