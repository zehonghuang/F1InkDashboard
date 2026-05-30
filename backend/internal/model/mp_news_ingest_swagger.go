package model

type MpNewsIngestRequestSwagger struct {
	ID              string                `json:"id" example:"n_f1_antonelli_russell_wolff"`
	LayoutCode      MpNewsLayoutCode      `json:"layout_code" example:"FEATURE"`
	HeroDisplayCode MpNewsHeroDisplayCode `json:"hero_display_code,omitempty" example:"BANNER"`
	TypeCode        MpNewsTypeCode        `json:"type_code" example:"PADDOCK"`
	Pinned          bool                  `json:"pinned,omitempty" example:"false"`
	Weight          int                   `json:"weight,omitempty" example:"880"`
	TagText         string                `json:"tag_text,omitempty" example:"Mercedes / 采访"`
	Tags            []string              `json:"tags,omitempty" example:"mercedes,44"`
	Title           string                `json:"title" example:"沃尔夫谈队内竞争：允许安东内利与拉塞尔硬碰硬，但会设底线"`
	Summary         string                `json:"summary,omitempty" example:"基于 Formula1.com 报道要点的中文改写"`
	CoverURL        string                `json:"cover_url,omitempty" example:"/static/news/f1-wolff-antonelli-russell.webp"`
	PublishedAt     string                `json:"published_at" example:"2026-05-25T18:30:00+08:00"`
	Source          *MpNewsSource         `json:"source,omitempty"`
	Content         *MpNewsContentSwagger `json:"content,omitempty"`
}

type MpNewsContentSwagger struct {
	FormatCode string                  `json:"format_code" example:"RICH_TEXT_NODES"`
	Text       string                  `json:"text,omitempty"`
	Nodes      []MpNewsRichTextNodeAny `json:"nodes,omitempty"`
}

type MpNewsRichTextNodeAny struct {
	Name     string            `json:"name,omitempty" example:"p"`
	Type     string            `json:"type,omitempty" example:"text"`
	Text     string            `json:"text,omitempty" example:"段落文本"`
	Attrs    map[string]string `json:"attrs,omitempty"`
	Children []any             `json:"children,omitempty"`
}

