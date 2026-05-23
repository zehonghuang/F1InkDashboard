# OpenF1 定时同步（入库）说明

## 目标

后端在 session 开始后，按固定周期（默认 60s）调用 OpenF1 API 并把所有端点数据写入 MySQL（复用 `backend/scripts/openf1_sync_all_mysql.py`）。

## 开关与环境变量

需要在启动后端前配置：

- `OPENF1_SCHEDULER_ENABLED=true`
- `OPENF1_SCHEDULER_INTERVAL_SEC=60`（默认 60）
- `OPENF1_SCHEDULER_GRACE_MIN=10`（session 结束后继续同步的“宽限期”，默认 10 分钟）
- `OPENF1_SCHEDULER_CATCHUP_ENABLED=true`（默认 true：启动时补齐错过的 session）
- `OPENF1_SCHEDULER_CATCHUP_LIMIT=20`（默认 20：启动时最多补齐多少个已结束但未成功同步的 session）
- `OPENF1_SCHEDULER_PYTHON=python`（Python 可执行文件）
- `OPENF1_SCHEDULER_SCRIPT=scripts/openf1_sync_all_mysql.py`（脚本路径，默认按后端工作目录解析）
- `OPENF1_SCHEDULER_MAX_REQ_PER_SEC=3`
- `OPENF1_SCHEDULER_MAX_REQ_PER_MIN=30`
- `OPENF1_SCHEDULER_QUIET=true`（默认 true，仅输出一行 summary JSON 供后端入库统计）

MySQL 连接仍然复用：
- `TOINC_F1_MYSQL_ENABLED=true`
- `TOINC_F1_MYSQL_HOST/PORT/USER/PASSWORD/DB`

## 表结构（同步记录）

建表 SQL： [005_create_openf1_scheduler_mysql.sql](file:///c:/Users/GinTonic/Desktop/zectrix/backend/sql/005_create_openf1_scheduler_mysql.sql)

- `openf1_sync_runs`：每次执行一条 run 记录（包含 `endpoints_json` 与 totals）
- `openf1_sync_session_status`：每个 session 的最新同步状态（便于快速判断哪些 session 没跑/跑失败）

## 如何判断哪些 session 没爬

### 1) 找到所有没有任何成功记录的 session

```sql
SELECT s.session_key, s.session_type, s.session_name, s.date_start_utc, s.date_end_utc
FROM openf1_sessions s
LEFT JOIN openf1_sync_session_status st
  ON st.session_key = s.session_key
WHERE s.is_cancelled IS NOT TRUE
  AND s.date_start_utc IS NOT NULL
  AND (st.last_success_at_utc IS NULL)
ORDER BY s.date_start_utc DESC;
```

### 2) 找到最近一次同步失败的 session

```sql
SELECT s.session_key, s.session_type, s.date_start_utc, st.last_attempt_at_utc, st.last_error_message
FROM openf1_sync_session_status st
JOIN openf1_sessions s ON s.session_key = st.session_key
WHERE st.last_ok = 0
ORDER BY st.last_attempt_at_utc DESC;
```

### 3) 查看某个 session 的历史 run 记录

```sql
SELECT id, started_at_utc, finished_at_utc, ok, duration_ms, total_rows, total_insert_attempt
FROM openf1_sync_runs
WHERE session_key = ?
ORDER BY started_at_utc DESC
LIMIT 50;
```

## 现有数据回填

如果 MySQL 里已经存在历史 OpenF1 数据（例如之前跑过 `openf1_sync_all_mysql.py`），但你希望同步到这两张记录表里：

```bash
python backend/scripts/openf1_backfill_sync_status_mysql.py --seed-runs --reset-seed-runs
```

- `openf1_sync_session_status` 会按每个 session 的数据量生成最新状态
- `openf1_sync_runs` 会为每个 session 生成一条 `backfill_seed` 的 run 记录（可重复执行，`--reset-seed-runs` 会清理旧的 seed）
