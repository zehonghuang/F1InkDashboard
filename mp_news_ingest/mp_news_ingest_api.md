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

  "tag_text": "Mercedes / 采访", // 必填：展示用短标签（长度<=64；生成规则见「tag_text/tags 生成规范」）
  "tags": ["Mercedes", "44", "Wolff"], // 必填：结构化标签数组（生成规则见「tag_text/tags 生成规范」；服务端会 trim+转小写+去重+排序后入库）

  "title": "沃尔夫谈队内竞争：允许安东内利与拉塞尔硬碰硬，但会设底线", // 必填：标题（长度<=256）
  "summary": "基于 Formula1.com 报道要点的中文改写", // 可选：摘要（默认空串；长度<=1024）

  "cover_url": "/static/news/f1-wolff-antonelli-russell.webp", // 可选：封面图 URL（默认空串；长度<=512；有图则取正文第一张图，没有则空）

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

## 重点（IMPORTANT｜模型必须遵守）

**tag_text / tags 必须以“语义理解（meaning-based）”为主生成**：先理解文章“讲的是谁/什么 + 发生了什么类型的事”，再输出标签；**禁止仅靠关键词命中/正则匹配**来决定标签。

### 1) 语义生成的具体流程（模型执行步骤）
对每篇文章，模型必须按以下顺序思考并输出：

1. **主实体（Primary Entity）是谁/什么？（只能选 1 个）**  
   从标题 + summary + 正文前 3 段中，判断最核心的对象：  
   - 车队 / 车手 / FIA（组织）/ 分站（Monaco GP 等）/ 规则议题  
   输出到：`tag_text` 的左侧（`<主实体> / ...`）以及 `tags`（slug）。
2. **文章属性（Event/Intent）是什么？（只能选 1 个）**  
   判断文章“主要在讲哪类事件/形态”（例如：转会、处罚、官宣、技术、规则、策略、商业合作等）。  
   输出到：`tag_text` 的右侧（`... / <文章属性>`）以及 `tags`（slug）。
3. **结构化 tags（可多选）**  
   在“主实体 slug + 属性 slug”基础上，可再补 0~3 个辅助 tags（例如：另一个强相关车队/组织/商业方/分站）。  
   但必须保持**原子词**，不可整句。

### 2) 明确禁止（Anti-patterns）
以下行为视为不合规输出：

- 只要标题出现 “FIA” 就打 `fia`，但文章语义其实是讲某车队/车手（仅引用 FIA 观点）  
- 仅因为正文出现 “penalty/处罚” 一词就打 `penalty`，但文章主题是**规则讨论/制度评述**  
- 仅因为出现 “engine/wing” 就打 `tech`，但文章核心是**政治/商业/人事**  
- `tag_text` 堆砌多个实体（例如 `Mercedes / Hamilton / Monaco / ...`）  
- `tags` 塞入带分隔符的字符串（如 `"mercedes/hamilton"`、`"fia,regulation"`）

### 3) 输出的硬性约束（MUST）
- `tag_text`：必须非空，格式必须是：`<主实体> / <文章属性>`（只允许一个 `/` 分隔）
- `tags`：必须是非空数组（至少 1 个元素），元素必须是**短字符串原子词**
- `tags` 里如果包含“车手 slug”，则必须同时包含对应车号（数字字符串）  
  - 例：包含 `hamilton` ⇒ 必须包含 `"44"`

### 4) 参考示例（语义正确）
- “讨论罚分制度是否仍有意义” ⇒  
  `tag_text: "FIA / 规则"`  
  `tags: ["fia","regulation","penalty"]`
- “Gucci 成为 Alpine 冠名合作伙伴” ⇒  
  `tag_text: "Alpine / 官宣"`  
  `tags: ["alpine","official","sponsor","gucci"]`
- “Hamilton 在 Ferrari 配合渐入佳境（长文分析）” ⇒  
  `tag_text: "Hamilton / 专题"`  
  `tags: ["hamilton","44","ferrari","feature"]`

## tag_text/tags 生成规范（必填）

这两个字段用于“分类展示 + 检索/过滤 + 聚合”。在爬虫侧必须生成并上送，避免出现空标签导致列表不可用或后续难以做聚合。

重要：这里的标签生成建议以“模型语义判断输出”为主（例如基于标题/摘要/正文的语义理解抽取主实体与属性），而不是简单的关键词匹配规则。

### tag_text（展示用短标签）

- 目标：给列表卡片一个“人类可读”的短标签，用于快速识别文章主题
- 格式建议：`<主实体> / <文章属性>`
  - `<主实体>`：车队/车手/赛事/赛道/组织等（优先级：车队 > 车手 > 赛事/赛道 > 规则/机构）
  - `<文章属性>`：内容类型/形态，例如：`转会`、`官宣`、`处罚`、`专访`、`技术`、`策略`、`赛后`、`前瞻`
- 生成规则（推荐）：
  - 必须非空、去首尾空格
  - 尽量控制在 8～20 个中文字符（或 20～40 个英文字符）以内
  - 不要塞过多实体；最多 1 个主实体 + 1 个属性
  - 示例：
    - `Mercedes / 采访`
    - `Hamilton / 转会`
    - `FIA / 规则`
    - `Monaco GP / 安全车`

### tags（结构化标签数组）

- 目标：可机器处理的标签集合，用于：
  - 标签页/筛选（例如“只看 Ferrari”）
  - 搜索召回增强
  - 聚合统计（例如某车手本周被提及次数）
- 生成来源（推荐按优先级）：
  1. 来源站点已有 tags/keywords（如果可靠）
  2. 从标题/摘要/正文抽取实体（车队/车手/赛事/赛道/组织/赛车编号等）
  3. 兜底：至少包含一个“主实体”标签（例如车队或车手）
- 标签内容规范（爬虫侧必须做到）：
  - 必须非空数组，至少 1 个元素
  - 元素必须是短字符串（建议 2～32 字符），不要整句
  - 建议使用稳定的英文/拼音 slug（便于后端聚合与去重），例如：`mercedes`、`hamilton`、`wolff`、`monaco`、`fia`
  - 如果 tags 中包含“车手”标签，则必须同时包含对应车号标签（数字字符串）；例如包含 `hamilton` 时需同时包含 `44`
  - 车号可用数字字符串：`44`、`1`
  - 不要包含 `/`、`,` 这类分隔符；一个 tag 就是一个原子词
- 服务端入库时的规范化行为（方便你预期最终落库值）：
  - trim
  - 转小写
  - 去重
  - 排序
- 示例：
  - `["mercedes","wolff","44"]`
  - `["fia","regulation","monaco"]`

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
