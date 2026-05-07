package thirdparty

import (
	"context"
	"crypto/sha1"
	"encoding/hex"
	"encoding/xml"
	"os"
	"strings"
)

type rssDoc struct {
	Channel struct {
		Items []rssItem `xml:"item"`
	} `xml:"channel"`
}

type rssItem struct {
	Title string `xml:"title"`
	Link  string `xml:"link"`
}

type atomFeed struct {
	Entries []atomEntry `xml:"entry"`
}

type atomEntry struct {
	Title string `xml:"title"`
	Links []struct {
		Href string `xml:"href,attr"`
		Rel  string `xml:"rel,attr"`
	} `xml:"link"`
}

func FetchRssFirstTitle(ctx context.Context) (map[string]string, bool) {
	raw := os.Getenv("NEWS_RSS_URLS")
	if strings.TrimSpace(raw) == "" {
		raw = "https://www.autosport.com/rss/f1/news/|https://www.motorsport.com/rss/f1/news/|https://www.grandprix.com/rss.xml"
	}
	urls := make([]string, 0, 4)
	for _, u := range strings.Split(raw, "|") {
		u = strings.TrimSpace(u)
		if u != "" {
			urls = append(urls, u)
		}
	}
	for _, url := range urls {
		text, err := GetText(ctx, url)
		if err != nil {
			continue
		}
		if it, ok := parseFirstRssItem(text); ok {
			return it, true
		}
		if it, ok := parseFirstAtomEntry(text); ok {
			return it, true
		}
	}
	return nil, false
}

func parseFirstRssItem(text string) (map[string]string, bool) {
	var doc rssDoc
	if err := xml.Unmarshal([]byte(text), &doc); err != nil {
		return nil, false
	}
	if len(doc.Channel.Items) == 0 {
		return nil, false
	}
	t := strings.TrimSpace(doc.Channel.Items[0].Title)
	u := strings.TrimSpace(doc.Channel.Items[0].Link)
	if t == "" {
		return nil, false
	}
	return map[string]string{"id": sha1Hex(t + "|" + u), "title": t, "url": u}, true
}

func parseFirstAtomEntry(text string) (map[string]string, bool) {
	var feed atomFeed
	if err := xml.Unmarshal([]byte(text), &feed); err != nil {
		return nil, false
	}
	if len(feed.Entries) == 0 {
		return nil, false
	}
	e := feed.Entries[0]
	t := strings.TrimSpace(e.Title)
	u := ""
	for _, l := range e.Links {
		if l.Rel == "" || l.Rel == "alternate" {
			u = strings.TrimSpace(l.Href)
			if u != "" {
				break
			}
		}
	}
	if t == "" {
		return nil, false
	}
	return map[string]string{"id": sha1Hex(t + "|" + u), "title": t, "url": u}, true
}

func sha1Hex(s string) string {
	h := sha1.Sum([]byte(s))
	return hex.EncodeToString(h[:])
}
