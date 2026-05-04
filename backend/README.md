# toinc_F1 Backend

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
- `WS /ws/openf1/raw`：订阅原始流（不做频率控制）
- `POST /api/v1/openf1/ingest`：注入 mock 数据（用于测试）
- `WS /ws/openf1/ingest`：通过 WS 注入 mock 数据（用于测试）
- `GET /api/v1/news/ws/status`：News WS 状态
- `WS /ws/news`：订阅突发新闻通知（服务端推送 JSON 文本）
- `POST /api/v1/news/ingest`：注入突发新闻 mock（JSON）
- `POST /api/v1/news/ws/ingest`：注入突发新闻 mock（multipart，支持上传 bin）
- `POST /api/v1/news/meme/ws/ingest`：注入 meme（multipart，支持 image+audio）
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

``` powershell
$env:NEWS_WS_ENABLED="1"                                                                                                         
$env:NEWS_INGEST_TOKEN="devtoken"
$env:OPENF1_MODE="mock"          
$env:OPENF1_ENABLED="1"   
$env:OPENF1_INGEST_TOKEN="devtoken"

$env:TOINC_F1_MYSQL_ENABLED="1"
```

## MySQL（可选）

后端已内置 MySQL 的读写逻辑与建表 SQL。你只需要创建一个新的库并把环境变量指向它即可。

### 创建新库

- 使用现有初始化 SQL：[001_create_ergast_f1_schema_mysql.sql](file:///c:/Users/GinTonic/Desktop/zectrix/backend/sql/001_create_ergast_f1_schema_mysql.sql)
  - 该文件默认 `CREATE DATABASE toinc_F1` / `USE toinc_F1`
  - 如果你要新库名（例如 `toinc_F1_dev`），把 SQL 里的库名替换后再执行

### 配置连接

启动后端进程前设置（示例）：

```powershell
$env:TOINC_F1_MYSQL_ENABLED="1"
$env:TOINC_F1_MYSQL_HOST="127.0.0.1"
$env:TOINC_F1_MYSQL_PORT="3306"
$env:TOINC_F1_MYSQL_USER="root"
$env:TOINC_F1_MYSQL_PASSWORD="123456"
$env:TOINC_F1_MYSQL_DB="toinc_F1_dev"
```

### 导入初始数据

```bash
cd backend
python -m app.cli ingest-ergast --season 2026
python -m app.cli ingest-circuit-assets --season 2026
```

## OpenF1 遥测落库（MySQL）

### 初始化表结构（创建一个新库也可以）

该项目的建表 SQL 在 `backend/sql/`，你可以用脚本把这些 SQL 初始化到一个新库名里：

```bash
cd backend
python scripts/mysql_init_toinc_f1_db.py --db toinc_F1_dev
```

然后把后端连接指向这个库：

```powershell
$env:TOINC_F1_MYSQL_ENABLED="1"
$env:TOINC_F1_MYSQL_DB="toinc_F1_dev"
```

### 同步 OpenF1 car_data / laps 到 MySQL

```bash
cd backend
python scripts/openf1_sync_mysql.py --driver-number 12,63 --enable-laps
```

约束：
- 总请求频率：每秒 <= 3，每分钟 <= 30（脚本内置限速）

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

推送频率控制：

- `OPENF1_PUSH_HZ`：后端向 `WS /ws/openf1` 推送的频率（默认 5Hz）
- 推送采用“每个 topic（若存在 driver_number 则按 topic+driver_number）缓存最新一条”，每个 tick 只把最新值推给固件

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
也支持 topic=`v1/meme`（payload.image + payload.audio，均为 base64）。

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

推送一个 meme（带 image+audio，可选）：

```bash
cd backend
.venv/Scripts/python scripts/news_meme_mock_push.py --base-url http://127.0.0.1:8008 --token devtoken --title "LOL" --image .\mock\meme.png --audio .\mock\meme.wav
```

## Offline bin（meme）

把 image 转为固件可直接用的 1bpp black1 `.bin`（无需固件解 PNG / base64），并把 wav 原样输出为文件：

```bash
cd backend
.venv/Scripts/python scripts/meme_assets_to_bin.py --image .\mock\meme.png --audio .\mock\meme.wav --out-dir .\out --prefix meme --w 384 --h 240
```

音频也支持 mp3 等格式（需要本机安装 `ffmpeg` 并在 PATH 中可用）：

```bash
cd backend
.venv/Scripts/python scripts/meme_assets_to_bin.py --audio .\mock\meme.mp3 --out-dir .\out --prefix meme --audio-ac 1 --audio-ar 16000
```
