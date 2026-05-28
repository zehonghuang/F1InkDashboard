---
name: "openclaw-f1-news-pipeline"
description: "生成并维护 OpenClaw+脚本的 F1 新闻抓取/翻译/打标流水线。用户要接入新站点、调整标签体系、或把文章落盘为 mp_news 时调用。"
---

# OpenClaw F1 新闻流水线

## 你要做什么

把 F1 媒体网站新闻定时抓取下来，交给 OpenClaw 完成中文改写与打标，并输出到后端 mp_news 静态文件供小程序读取。

## 仓库内的落地点

- 脚本入口：`backend/scripts/news_mp_news_crawl.py`
- 运行说明：`backend/scripts/news_mp_news_crawl.md`
- OpenClaw 资产（prompt/schema/example）：`openclaw/skills/f1_news_enrich_v1/`
- mp_news 接口读取：`GET /api/v1/mp/news` 与 `GET /api/v1/mp/news/:id`

## 常见改造任务

### 1) 增加新站点

按优先级选择入口：
- 有 RSS/Atom：把 feed 加到 `NEWS_RSS_URLS`
- 没有 RSS：把列表页加到 `NEWS_LIST_URLS`，并在脚本里补充该站点的链接过滤规则（避免抓到无关页面）

### 2) 提升正文抽取质量

优先从网页的 JSON-LD（application/ld+json）抽取 `headline/datePublished/articleBody/image`。
如果站点没有提供 JSON-LD，再补 `og:title/og:image/article:published_time` 等 meta 兜底。

### 3) 调整标签体系与分类映射

修改 OpenClaw prompt（`openclaw/skills/f1_news_enrich_v1/prompt.md`）：
- type_code 只允许：REGULATION/PADDOCK/STRATEGY/DRIVER/TECH
- tags 建议用 `namespace:value` 形式（例如 team:Mercedes）

### 4) 调整小程序展示

mp_news 现在支持可选字段 `tags: string[]`，小程序 API 已透传。若要展示，需要在 news 列表/详情页增加 UI。

