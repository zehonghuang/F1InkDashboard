# raw_html 监听 → 组装 mp_news JSON → POST 入库

目标：监听 `mp_news_ingest/raw_html/` 下各来源目录的新增 `*.html`（忽略 `*.raw.html`），把新增文章转换为 `POST /api/v1/mp/news/ingest` 所需的 JSON，并提交到后端。

后端接口字段说明见：

- [mp_news_ingest_api.md](file:///c:/F1InkDashboard/mp_news_ingest/mp_news_ingest_api.md)
- [mp_news_content.md](file:///c:/F1InkDashboard/mp_news_ingest/mp_news_content.md)

## 目录约定

- 输入目录：`mp_news_ingest/raw_html/<source>/`
  - 正文：`*.html`（会被处理）
  - 元信息：同名 `*.json`（可选；来源爬虫通常会写入 url/title/published_at 等）
  - 原始页：`*.raw.html`（忽略）
- 输出目录（本任务脚本写入）：默认 `mp_news_ingest/out_ingest_payloads/`

## 配置

复制一份配置文件：

- `config.example.json` → `config.json`

必须确认的字段：

- `ingest_url`：入库接口完整 URL  
  - 默认：`https://winpc-f1.normal-person.icu/api/v1/mp/news/ingest`
- `raw_html_dir`：默认 `mp_news_ingest/raw_html`

可选字段：

- `poll_interval_sec`：轮询间隔秒数（默认 5）
- `state_path`：处理状态文件（默认 `mp_news_ingest/state/raw_html_watch_ingest_state.json`）
- `dry_run`：只生成 JSON，不 POST（默认 false）

## 运行

一次性扫描（常用于手动补跑）：

```bash
python mp_news_ingest/solo_tasks/raw_html_watch_ingest/watch_raw_html_ingest.py --once --dry-run
```

持续监听：

```bash
python mp_news_ingest/solo_tasks/raw_html_watch_ingest/watch_raw_html_ingest.py
```

指定配置文件：

```bash
python mp_news_ingest/solo_tasks/raw_html_watch_ingest/watch_raw_html_ingest.py --config mp_news_ingest/solo_tasks/raw_html_watch_ingest/config.json
```

## JSON 生成策略（当前实现）

当前版本先保证“可入库、可展示、可追溯”，字段策略：

- `id`：由 `<source> + filename/url + published_at` 生成，保证只含 `[a-zA-Z0-9_-]`，并截断到 64 字符
- `layout_code`：默认 `STANDARD`
- `type_code`：默认 `PADDOCK`
- `title`：优先取同名 `*.json` 的 `title`，否则从 HTML `<title>` 兜底，再不行用文件名
- `published_at`：优先取同名 `*.json` 的 `published_at`（支持 RFC3339 / RFC822），否则用文件 mtime（UTC）
- `source`：`name=<source>`；`url` 优先取元信息 `url`
- `content.format_code`：`PLAIN`
- `content.text`：从 HTML 粗略剥离标签后的纯文本
- `summary`：从纯文本截取前 160 字符（可用后续翻译/改写结果替换）

## 待办清单（翻译/改写）

你要求“翻译作为任务 TODO 放在文档里”，所以这里把实现项拆出来，后续按需逐条完成：

1. 接入翻译/改写引擎（推荐 OpenClaw skill 或任意你指定的翻译 API）
2. 以翻译/改写结果填充：
   - `title`（中文）
   - `summary`（中文）
   - `content`：优先输出 `RICH_TEXT_NODES` + `nodes`，同时保留 `text`
3. 规则与枚举治理：
   - `layout_code` / `type_code` 的映射策略
   - `tags` 的输出规范（去重、统一大小写、排序）
4. 封面图策略：
   - 从 HTML 抽取首图/og:image
   - 或由翻译/改写引擎输出 cover_url

