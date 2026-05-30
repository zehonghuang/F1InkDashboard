package model

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strings"
)

type MpNewsSource struct {
	Name string `json:"name"`
	URL  string `json:"url,omitempty"`
}

type MpNewsContent struct {
	FormatCode string               `json:"format_code"`
	Text       string               `json:"text,omitempty"`
	Nodes      []MpNewsRichTextNode `json:"nodes,omitempty"`
}

type MpNewsRichTextNode struct {
	Name     string                 `json:"name,omitempty"`
	Type     string                 `json:"type,omitempty"`
	Text     string                 `json:"text,omitempty"`
	Attrs    map[string]any         `json:"attrs,omitempty"`
	Children MpNewsRichTextChildren `json:"children,omitempty"`
}

type MpNewsRichTextChildren []MpNewsRichTextNode

func (c *MpNewsRichTextChildren) UnmarshalJSON(b []byte) error {
	b = bytes.TrimSpace(b)
	if len(b) == 0 || bytes.Equal(b, []byte("null")) {
		*c = nil
		return nil
	}
	if len(b) > 0 && b[0] == '"' {
		var s string
		if err := json.Unmarshal(b, &s); err != nil {
			return err
		}
		s = strings.TrimSpace(s)
		if s == "" {
			*c = nil
			return nil
		}
		*c = MpNewsRichTextChildren{{Type: "text", Text: s}}
		return nil
	}
	if len(b) > 0 && b[0] == '{' {
		var n MpNewsRichTextNode
		if err := json.Unmarshal(b, &n); err != nil {
			return err
		}
		*c = MpNewsRichTextChildren{n}
		return nil
	}
	if len(b) > 0 && b[0] == '[' {
		var arr []json.RawMessage
		if err := json.Unmarshal(b, &arr); err != nil {
			return err
		}
		out := make([]MpNewsRichTextNode, 0, len(arr))
		for _, raw := range arr {
			raw = bytes.TrimSpace(raw)
			if len(raw) == 0 || bytes.Equal(raw, []byte("null")) {
				continue
			}
			if raw[0] == '"' {
				var s string
				if err := json.Unmarshal(raw, &s); err != nil {
					return err
				}
				s = strings.TrimSpace(s)
				if s != "" {
					out = append(out, MpNewsRichTextNode{Type: "text", Text: s})
				}
				continue
			}
			var n MpNewsRichTextNode
			if err := json.Unmarshal(raw, &n); err != nil {
				return err
			}
			out = append(out, n)
		}
		*c = out
		return nil
	}
	return fmt.Errorf("invalid children json: %s", string(b))
}

type MpNewsItem struct {
	ID              string                `json:"id"`
	LayoutCode      MpNewsLayoutCode      `json:"layout_code"`
	HeroDisplayCode MpNewsHeroDisplayCode `json:"hero_display_code,omitempty"`
	TypeCode        MpNewsTypeCode        `json:"type_code"`
	Pinned          bool                  `json:"pinned"`
	Weight          int                   `json:"weight"`
	TagText         string                `json:"tag_text"`
	Tags            []string              `json:"tags,omitempty"`
	Title           string                `json:"title"`
	Summary         string                `json:"summary"`
	CoverURL        string                `json:"cover_url"`
	PublishedAt     string                `json:"published_at" example:"2026-05-25T18:30:00+08:00"`
	TimeText        string                `json:"time_text"`
	Source          *MpNewsSource         `json:"source,omitempty"`
	Content         *MpNewsContent        `json:"content,omitempty"`
}

type MpNewsListResponse struct {
	Ok             bool         `json:"ok"`
	GeneratedAtUTC string       `json:"generated_at_utc"`
	Tz             string       `json:"tz"`
	BaseURL        string       `json:"base_url"`
	Page           int          `json:"page"`
	PageSize       int          `json:"page_size"`
	Total          int          `json:"total"`
	Items          []MpNewsItem `json:"items"`
}

type MpNewsDetailResponse struct {
	Ok             bool       `json:"ok"`
	GeneratedAtUTC string     `json:"generated_at_utc"`
	Tz             string     `json:"tz"`
	BaseURL        string     `json:"base_url"`
	Item           MpNewsItem `json:"item"`
}
