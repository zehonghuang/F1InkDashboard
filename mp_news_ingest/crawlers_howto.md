# mp_news_ingest 爬取脚本使用说明

本目录的爬取脚本负责把外部资讯页面抓取并落盘到 `mp_news_ingest/raw_html/<source>/`，同时维护增量状态文件与索引，供后续“翻译/改写 → 入库”阶段使用。

## 产物与目录约定

- Python 依赖安装：

```bash
pip install -r mp_news_ingest/requirements.txt
```

- 抓取输出（按来源分目录）：
  - `mp_news_ingest/raw_html/<source>/*.html`：清洗/抽取后的正文 HTML
  - `mp_news_ingest/raw_html/<source>/*.json`：与 html 同名的元信息（url/title/published_at/fetched_at_utc 等）
  - `mp_news_ingest/raw_html/<source>/*.raw.html`：可选保留原始页面（仅当爬虫参数开启）
- 增量状态：
  - `mp_news_ingest/state/<source>.json`：last_url、seen_urls 等
- 索引输出：
  - `mp_news_ingest/indices/<source>.json`：该来源目录下的 html 列表（含 url/title/published_at 等）
  - `mp_news_ingest/indices/all.json`：所有来源汇总
  - `mp_news_ingest/indices/last_run.json`：最近一次 run_crawlers_loop 的执行结果

## 1) crawl_autosport_html.py（抓取 Autosport F1 RSS）

文件：[crawl_autosport_html.py](file:///c:/F1InkDashboard/mp_news_ingest/crawl_autosport_html.py)

用途：
- 从 Autosport F1 新闻 RSS 发现新文章
- 拉取文章页 HTML，按规则抽取正文区域并清洗
- 写入 `raw_html/autosport/` 与 `state/autosport.json`

### 常用命令

默认抓取（最多 10 条；落到默认目录 `raw_html/autosport/`）：

```bash
python mp_news_ingest/crawl_autosport_html.py --max-items 10
```

写到指定目录（适合临时调试）：

```bash
python mp_news_ingest/crawl_autosport_html.py --out-dir mp_news_ingest/raw_html/autosport --max-items 5
```

按日期分子目录（会落到 `.../autosport/YYYYMMDD/`）：

```bash
python mp_news_ingest/crawl_autosport_html.py --date-subdir --max-items 10
```

保留原始页（额外写出 `*.raw.html`）：

```bash
python mp_news_ingest/crawl_autosport_html.py --keep-raw --max-items 10
```

遇到“需要确认您是人类 / 安全检查 / verify you are human”等拦截时，弹出浏览器手动完成验证并复用 cookie：

```bash
python mp_news_ingest/crawl_autosport_html.py --fetch-mode playwright --interactive --max-items 10
```

### 参数速查

- `--rss-url`：RSS 地址（默认 `https://www.autosport.com/rss/f1/news/`）
- `--out-dir`：输出目录（默认 `mp_news_ingest/raw_html/autosport/`）
- `--date-subdir`：是否按日期分目录
- `--max-items`：最多抓取多少篇新文章
- `--timeout`：请求超时秒数
- `--sleep-ms`：抓取间隔毫秒（避免过快触发站点限制）
- `--fetch-mode`：`auto|httpx|playwright`
  - `auto`：优先普通请求；遇到 403/429 会切换到 playwright 渲染抓取
  - 若 RSS 本身出现 403/405/429（站点人机校验/策略限制），会回退到 playwright 抓取 RSS 内容
- `--extract`：正文抽取策略（默认 `ms-article_detail`）
- `--keep-raw`：是否额外保存原始 HTML 到 `*.raw.html`
- `--no-strip-script-style`：关闭 script/style 清理（调试用）
- `--state-file`：状态文件路径（默认 `mp_news_ingest/state/autosport.json`）
- `--interactive`：启用“弹出浏览器手动验证”模式（playwright 非 headless）
- `--storage-state`：playwright storage_state 文件路径（用于复用 cookie；默认会写 `mp_news_ingest/state/autosport_playwright_state.json`）

## 2) run_crawlers_loop.py（按配置轮询运行爬虫 + 生成 indices）

文件：[run_crawlers_loop.py](file:///c:/F1InkDashboard/mp_news_ingest/run_crawlers_loop.py)

用途：
- 按 `crawlers.json` 配置依次执行多个爬虫命令
- 每轮结束后扫描 `raw_html/<task.name>/` 目录，生成/刷新 indices

### 配置文件 crawlers.json

文件：[crawlers.json](file:///c:/F1InkDashboard/mp_news_ingest/crawlers.json)

字段：
- `interval_minutes`：循环间隔分钟数
- `indices_dir`：索引输出目录
- `tasks[]`：
  - `name`：任务名（也会用作 raw_html 的子目录名：`raw_html/<name>/`）
  - `cwd`：运行命令的工作目录（相对仓库根目录）
  - `cmd`：要执行的命令数组（等价于 shell 中的参数列表）

当前仓库自带的 autosport 示例：

```jsonc
{
  "name": "autosport",
  "cwd": ".",
  "cmd": ["python", "mp_news_ingest/crawl_autosport_html.py", "--max-items", "10"]
}
```

### 常用命令

单次执行（跑完任务并生成 indices，然后退出）：

```bash
python mp_news_ingest/run_crawlers_loop.py --once
```

常驻循环（按 interval_minutes 间隔持续跑）：

```bash
python mp_news_ingest/run_crawlers_loop.py
```

指定配置文件（适合你复制一份做实验）：

```bash
python mp_news_ingest/run_crawlers_loop.py --config mp_news_ingest/crawlers.json --once
```

强制覆盖循环间隔（无需改 JSON）：

```bash
python mp_news_ingest/run_crawlers_loop.py --interval-minutes 3
```

### 输出查看

- 本轮执行结果：`mp_news_ingest/indices/last_run.json`
- 文章索引：
  - `mp_news_ingest/indices/autosport.json`
  - `mp_news_ingest/indices/all.json`

## 下一步（翻译/改写 → 入库）

爬虫只负责落 `raw_html/`。后续把新增 html 转成 `POST /api/v1/mp/news/ingest` 的 JSON 并入库，可参考：

- [raw_html_watch_ingest/README.md](file:///c:/F1InkDashboard/mp_news_ingest/solo_tasks/raw_html_watch_ingest/README.md)
