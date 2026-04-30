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
