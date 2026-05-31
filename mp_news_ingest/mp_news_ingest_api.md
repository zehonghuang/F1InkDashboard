# POST /api/v1/mp/news/ingest（资讯入库）

用于 OpenClaw/爬虫将资讯文章 Upsert 写入 MySQL：

- `mp_news_articles`
- `mp_news_article_tags`（会先清空该文章的 tags 再重建）

实现参考：

- Handler：[/backend/internal/httpserver/handlers/mp_news_ingest.go](file:///c:/F1InkDashboard/backend/internal/httpserver/handlers/mp_news_ingest.go)
- 请求模型：[/backend/internal/model/mp_news.go](file:///c:/F1InkDashboard/backend/internal/model/mp_news.go)、[/backend/internal/model/mp_news_ingest.go](file:///c:/F1InkDashboard/backend/internal/model/mp_news_ingest.go)
- 枚举常量：[/backend/internal/model/mp_news_codes.go](file:///c:/F1InkDashboard/backend/internal/model/mp_news_codes.go)
- 表结构：[/backend/sql/010_create_mp_news_mysql.sql](file:///c:/F1InkDashboard/backend/sql/010_create_mp_news_mysql.sql)

## 鉴权（Query）

### token

- 类型：`string`
- 必填：当服务端配置 `NEWS_INGEST_TOKEN` 非空时必填
- 规则：必须与服务端配置完全一致，否则返回 `401 unauthorized`

## 请求体（JSON）

说明：请求体字段为平铺结构（没有外层 `item` 包裹），字段定义来自 `MpNewsItem`。

```jsonc
{
  "id": "n_f1_antonelli_russell_wolff", // 必填：文章唯一 ID（只允许 [a-zA-Z0-9_-]；长度<=64）

  "layout_code": "FEATURE", // 必填：布局类型（见「枚举」）
  "hero_display_code": "BANNER", // 可选：HERO 展示类型（见「枚举」；仅 layout_code=HERO 时通常有意义）
  "type_code": "PADDOCK", // 必填：内容类型（见「枚举」）

  "pinned": false, // 可选：是否置顶（默认 false）
  "weight": 880, // 可选：排序权重（默认 0；越大越靠前）

  "tag_text": "Mercedes / 采访", // 可选：展示用短标签（默认空串；长度<=64）
  "tags": ["Mercedes", "44", "Wolff"], // 可选：结构化标签数组；服务端会 trim+转小写+去重+排序后入库

  "title": "沃尔夫谈队内竞争：允许安东内利与拉塞尔硬碰硬，但会设底线", // 必填：标题（长度<=256）
  "summary": "基于 Formula1.com 报道要点的中文改写", // 可选：摘要（默认空串；长度<=1024）

  "cover_url": "/static/news/f1-wolff-antonelli-russell.webp", // 可选：封面图 URL（默认空串；长度<=512）

  "published_at": "2026-05-25T18:30:00+08:00", // 必填：RFC3339/RFC3339Nano；也支持 Z（会按 +00:00 处理并入库为 UTC）
  "time_text": "", // 可选：该接口入库时不会使用；通常建议不传/传空

  "source": {
    "name": "Formula1.com", // 可选：来源名称（默认空串；长度<=64）
    "url": "https://www.formula1.com/..." // 可选：来源链接（默认空串；长度<=1024）
  },

  "content": {
    "format_code": "RICH_TEXT_NODES", // 可选：正文格式；不传/空则默认 "PLAIN"
    "text": "纯文本正文...", // 可选：纯文本正文（写入 content_text）
    "nodes": [
      {
        "name": "p",
        "children": [
          { "type": "text", "text": "第一段内容……" }
        ]
      },
      {
        "name": "img",
        "attrs": { "src": "https://example.com/a.jpg", "mode": "widthFix" }
      }
    ] // 可选：小程序 rich-text nodes；会被 JSON 序列化后写入 content_nodes(JSON)
  }
}
```

## content（正文）说明

`content.format_code/text/nodes` 的完整说明请见：

- [mp_news_content.md](./mp_news_content.md)

## 枚举

### layout_code（MpNewsLayoutCode）

- `BREAKING`
- `HERO`
- `FEATURE`
- `STANDARD`
- `BULLETIN`

#### 推荐判定规则（按“新闻级别/重要性”）

- `BREAKING`：相对“炸裂/突发/影响面大”的新闻；例如转会、车手/车队人事变动、重大事故、重大处罚/禁赛、重大判罚争议等
- `HERO`：高优先级但不一定“突发”的头条型内容；例如赛规/技术规则/比赛流程的重要变动、FIA/车队官方重磅公告等（通常适合大图/头条位展示）
- `FEATURE`：深度/专题/长文；例如专访、复盘、技术解析、人物故事等
- `STANDARD`：普通资讯；例如一般性新闻、花絮、日常更新等（默认推荐）
- `BULLETIN`：短公告/简报/提醒类；例如活动通知、简短通告、列表式要点等

### hero_display_code（MpNewsHeroDisplayCode）

- `BANNER`
- `CARD`

### type_code（MpNewsTypeCode）

- `REGULATION`
- `PADDOCK`
- `STRATEGY`
- `DRIVER`
- `TECH`

## 响应

### 200 OK

```json
{
  "ok": true,
  "id": "n_f1_antonelli_russell_wolff"
}
```

### 400/401/500/503 Error

```json
{
  "ok": false,
  "error": "bad_json"
}
```

## 错误码（error 字段）

### 401

- `unauthorized`：token 缺失/不匹配

### 503

- `mysql_required`：服务端未连接 MySQL（db == nil）

### 400

- `bad_json`：请求体 JSON 解析失败
- `bad_id`：id 为空或包含非法字符（只允许 `[a-zA-Z0-9_-]`）
- `missing_layout_code`
- `missing_type_code`
- `missing_title`
- `missing_published_at`
- `bad_published_at`：published_at 无法按 RFC3339/RFC3339Nano 解析

### 500

- `db_failed`：事务 begin/exec/commit 失败（统一错误）

