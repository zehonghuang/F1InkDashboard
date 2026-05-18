package f1db

import (
	"strings"
	"sync"
	"time"

	"gorm.io/gorm"
)

type i18nTextRow struct {
	EntityKey string `gorm:"column:entity_key"`
	Text      string `gorm:"column:text"`
}

func shouldApplyI18n(lang string) bool {
	s := strings.TrimSpace(strings.ToLower(lang))
	if s == "" {
		return false
	}
	if s == "en" || s == "en-us" || strings.HasPrefix(s, "en-") {
		return false
	}
	return true
}

type i18nCacheKey struct {
	Lang       string
	EntityType string
	Field      string
}

type i18nCacheEntry struct {
	ExpiresAt time.Time
	Data      map[string]string
}

var i18nCacheMu sync.RWMutex
var i18nCache = map[i18nCacheKey]i18nCacheEntry{}

func getI18nIndex(db *gorm.DB, lang string, entityType string, field string) (map[string]string, error) {
	key := i18nCacheKey{
		Lang:       strings.TrimSpace(lang),
		EntityType: strings.TrimSpace(entityType),
		Field:      strings.TrimSpace(field),
	}
	if key.Lang == "" || key.EntityType == "" || key.Field == "" {
		return map[string]string{}, nil
	}

	now := time.Now()
	i18nCacheMu.RLock()
	if ent, ok := i18nCache[key]; ok && now.Before(ent.ExpiresAt) && ent.Data != nil {
		data := ent.Data
		i18nCacheMu.RUnlock()
		return data, nil
	}
	i18nCacheMu.RUnlock()

	type row struct {
		EntityKey string `gorm:"column:entity_key"`
		Text      string `gorm:"column:text"`
	}
	var rows []row
	err := db.Raw(
		`SELECT entity_key, text
FROM i18n_text
WHERE entity_type = ?
  AND field = ?
  AND lang = ?`,
		key.EntityType, key.Field, key.Lang,
	).Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	m := map[string]string{}
	for _, r := range rows {
		k := strings.TrimSpace(r.EntityKey)
		v := strings.TrimSpace(r.Text)
		if k == "" || v == "" {
			continue
		}
		m[k] = v
	}

	i18nCacheMu.Lock()
	i18nCache[key] = i18nCacheEntry{
		ExpiresAt: now.Add(60 * time.Second),
		Data:      m,
	}
	i18nCacheMu.Unlock()

	return m, nil
}

func fetchI18nText(db *gorm.DB, lang string, entityType string, field string, keys []string) (map[string]string, error) {
	out := map[string]string{}
	if db == nil || !shouldApplyI18n(lang) || strings.TrimSpace(entityType) == "" || strings.TrimSpace(field) == "" || len(keys) == 0 {
		return out, nil
	}

	seen := map[string]struct{}{}
	uniq := make([]string, 0, len(keys))
	for _, k := range keys {
		k = strings.TrimSpace(k)
		if k == "" {
			continue
		}
		if _, ok := seen[k]; ok {
			continue
		}
		seen[k] = struct{}{}
		uniq = append(uniq, k)
	}
	if len(uniq) == 0 {
		return out, nil
	}

	idx, err := getI18nIndex(db, lang, entityType, field)
	if err != nil {
		return out, err
	}
	for _, k := range uniq {
		if v, ok := idx[k]; ok && strings.TrimSpace(v) != "" {
			out[k] = strings.TrimSpace(v)
		}
	}
	return out, nil
}
