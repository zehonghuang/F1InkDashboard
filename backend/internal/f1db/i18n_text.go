package f1db

import (
	"strings"

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

	var rows []i18nTextRow
	err := db.Raw(
		`SELECT entity_key, text
FROM i18n_text
WHERE entity_type = ?
  AND field = ?
  AND lang = ?
  AND entity_key IN ?`,
		entityType, field, lang, uniq,
	).Scan(&rows).Error
	if err != nil {
		return out, err
	}
	for _, r := range rows {
		k := strings.TrimSpace(r.EntityKey)
		v := strings.TrimSpace(r.Text)
		if k == "" || v == "" {
			continue
		}
		out[k] = v
	}
	return out, nil
}

