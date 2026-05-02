# Zectrix Backend

提供 F1 两个页面所需数据的 HTTP API。数据来源为第三方公开接口（赛历/积分榜/天气/新闻），并做轻量缓存以降低请求频率。

数据源：

- 赛历/积分榜：Jolpica Ergast 镜像（Ergast 兼容 JSON）
- 天气：Open-Meteo
- 新闻：RSS（默认 motorsport/autosport/grandprix，按可用性自动回退）

## 运行

```bash
cd backend
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt
.venv/Scripts/uvicorn app.main:app --host 0.0.0.0 --port 8008
```

## API

- `GET /health`
- `GET /api/v1/ws/status`：当前 WS 连接数
- `POST /api/v1/ws/broadcast?text=...`：向所有已连接 WS 客户端广播文本
- `WS /ws`：WebSocket 服务端（文本 echo）
- `GET /api/v1/openf1/status`：OpenF1/Mock 流状态
- `WS /ws/openf1`：订阅 OpenF1/Mock 流（服务端推送 JSON 文本）
- `POST /api/v1/openf1/ingest`：注入 mock 数据（用于测试）
- `WS /ws/openf1/ingest`：通过 WS 注入 mock 数据（用于测试）
- `GET /api/v1/news/ws/status`：News WS 状态
- `WS /ws/news`：订阅突发新闻通知（服务端推送 JSON 文本）
- `POST /api/v1/news/ingest`：注入突发新闻 mock（JSON）
- `POST /api/v1/news/ws/ingest`：注入突发新闻 mock（multipart，支持上传 bin）
- `GET /api/v1/pages`：同时返回 race-day 与 off-week 两页数据
- `GET /api/v1/pages/race-day`
- `GET /api/v1/pages/off-week`
- `GET /api/v1/ui/pages`：UI 直用格式（带列宽/对齐）
- `GET /api/v1/ui/pages/race-day`
- `GET /api/v1/ui/pages/off-week`

可选参数：

- `tz`：时区，默认 `Asia/Bahrain`

UI 直用接口额外字段：

- `decision_tz`: `"Asia/Shanghai"`（用于判断是否比赛周）
- `is_race_week`: `true/false`
- `default_page`: `"race_day"` 或 `"off_week"`（固件可据此决定默认显示页）

## OpenF1 Mock

后端内置一个 OpenF1 风格的 mock 转发层：你可以先让后端接收 mock 注入数据，再从 `WS /ws/openf1` 订阅到同样的消息。

启用 mock：

```bash
set OPENF1_MODE=mock
set OPENF1_ENABLED=1
```

可选：为注入接口加 token（避免公网误调用）：

```bash
set OPENF1_INGEST_TOKEN=devtoken
```

注意：这些环境变量是在后端进程启动时读取的；修改后需要重启 uvicorn 进程才会生效。

推送一组 mock（默认读取 `backend/mock/openf1_mock_packets.jsonl`）：

```bash
cd backend
.venv/Scripts/python scripts/openf1_mock_push.py --base-url http://127.0.0.1:8008 --token devtoken --interval 0.2
```

让 mock 更“长”（重复播放同一份 jsonl）：

```bash
cd backend
.venv/Scripts/python scripts/openf1_mock_push.py --base-url http://127.0.0.1:8008 --token devtoken --interval 0.2 --repeat 50
```

## News WS Mock

用于“突发新闻”推送的 WS：客户端订阅 `WS /ws/news`，后端推送 topic=`v1/breaking` 的消息。

启用：

```bash
set NEWS_WS_ENABLED=1
```

可选：为注入接口加 token：

```bash
set NEWS_INGEST_TOKEN=devtoken
```

推送一组 mock（默认读取 `backend/mock/news_breaking_mock_packets.jsonl`）：

```bash
cd backend
.venv/Scripts/python scripts/news_mock_push.py --base-url http://127.0.0.1:8008 --token devtoken --interval 0.2
```
