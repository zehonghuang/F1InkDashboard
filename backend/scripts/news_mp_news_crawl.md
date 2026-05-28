## 目标

定时抓取 F1 媒体新闻（RSS + 站内列表页），抽取文章正文后调用 OpenClaw（HTTP API）完成：
- 中文改写/翻译
- 分类（type_code）
- 多标签（tags）
- 正文富文本节点（content.nodes）

最终落盘为小程序使用的 mp_news 静态数据：
- `backend/static/mp_news/index.json`
- `backend/static/mp_news/items/<id>.json`

入口脚本：`backend/scripts/news_mp_news_crawl.py`

## OpenClaw 约定（最小协议）

脚本会发起 POST：
- `OPENCLAW_BASE_URL` + `OPENCLAW_RUN_PATH`（默认 `/run`）

请求 JSON：
```json
{
  "skill": "f1_news_enrich_v1",
  "input": { "...": "见 openclaw/skills/f1_news_enrich_v1/example_input.json" }
}
```

响应 JSON 支持两种形态：
- 直接返回输出对象（推荐）
- 或返回 `{ "output": { ...输出对象... } }`

输出对象规范建议参考：
- `openclaw/skills/f1_news_enrich_v1/prompt.md`
- `openclaw/skills/f1_news_enrich_v1/schema.json`

鉴权：
- 可通过 `OPENCLAW_AUTH_HEADER`/`OPENCLAW_AUTH_VALUE` 注入任意 header（默认 header 名为 `Authorization`）

## 环境变量

抓取入口：
- `NEWS_RSS_URLS`：用 `|` 分隔的 RSS/Atom 地址（默认 autosport/motorsport/grandprix）
- `NEWS_LIST_URLS`：用 `|` 分隔的列表页地址（默认 `https://www.formula1.com/en/latest`）

OpenClaw：
- `OPENCLAW_BASE_URL`：必填
- `OPENCLAW_RUN_PATH`：默认 `/run`
- `OPENCLAW_NEWS_SKILL`：默认 `f1_news_enrich_v1`
- `OPENCLAW_AUTH_HEADER`：默认 `Authorization`
- `OPENCLAW_AUTH_VALUE`：可选

运行参数：
- `NEWS_MAX_NEW`：单次最多写入多少条新文章，默认 10
- `NEWS_HTTP_TIMEOUT`：HTTP 超时秒数，默认 20

## 运行

```bash
python backend/scripts/news_mp_news_crawl.py --static-dir backend/static
```

仅看 OpenClaw 入参（不落盘）：
```bash
python backend/scripts/news_mp_news_crawl.py --dry-run
```

## 定时任务（示例）

Linux cron（每 10 分钟）：
```cron
*/10 * * * * cd /path/to/F1InkDashboard && OPENCLAW_BASE_URL=http://127.0.0.1:9000 python backend/scripts/news_mp_news_crawl.py
```

Windows 任务计划程序：
- 操作：启动程序 `python`
- 参数：`backend\scripts\news_mp_news_crawl.py`
- 起始于：`c:\F1InkDashboard`

