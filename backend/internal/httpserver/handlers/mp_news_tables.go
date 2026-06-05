package handlers

import (
	"strings"
	"toinc_f1_backend/internal/config"
)

type mpNewsTables struct {
	Articles string
	Tags     string
}

func mpNewsTablesByCfg(cfg config.Config) mpNewsTables {
	ds := strings.ToLower(strings.TrimSpace(cfg.MpNewsDataset))
	if cfg.MpReviewMode {
		ds = "review"
	}
	switch ds {
	case "review", "r":
		return mpNewsTables{Articles: "mp_news_articles_review", Tags: "mp_news_article_tags_review"}
	default:
		return mpNewsTables{Articles: "mp_news_articles", Tags: "mp_news_article_tags"}
	}
}

