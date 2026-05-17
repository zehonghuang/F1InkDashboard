# openf1_lap_controls_series 使用说明

## 目标

`openf1_lap_controls_series` 用于缓存“单圈（lap）级别”的预计算遥测序列，便于前端/固件快速渲染。

- 支持按 S1 / S2 / S3 分段（通过 `payload_json` 内的 `s1_end_ms/s2_end_ms` 或 `s1_end_i/s2_end_i`）
- 当前仅覆盖三类指标：`speed`、`throttle`、`brake`

数据来源（原始表）：
- `openf1_laps`：圈起点与赛段时长
- `openf1_car_data`：时间序列点（speed/throttle/brake）

## 表结构

建表 SQL： [004_create_openf1_precomputed_mysql.sql](file:///c:/Users/GinTonic/Desktop/zectrix/backend/sql/004_create_openf1_precomputed_mysql.sql#L1-L22)

核心字段：
- `session_key`：会话唯一标识（比赛/排位/练习等）
- `driver_number`：车手号码
- `lap_number`：圈号（从 1 开始）
- `date_start_utc`：该圈起始 UTC 时间（与 `openf1_laps.date_start_utc` 对齐）
- `max_points`：本条记录写入时的采样上限（点数上限）。同一圈可存不同 `max_points` 版本（唯一键包含 `date_start_utc`，查询逻辑通常按 max_points 选择）
- `points_count`：实际点数
- `payload_json`：预计算 JSON 负载（见下）

索引：
- `uq_openf1_lap_controls_series (session_key, driver_number, lap_number, date_start_utc)`
- `ix_openf1_lap_controls_series_session_driver (session_key, driver_number)`
- `ix_openf1_lap_controls_series_session_driver_lap (session_key, driver_number, lap_number)`

## payload_json 结构（v=1）

该字段是 JSON，推荐用紧凑格式（脚本已使用 separators 压缩）。

```json
{
  "v": 1,
  "t_end_ms": 91743,
  "s1_end_ms": 26966,
  "s2_end_ms": 65623,
  "s1_end_i": 144,
  "s2_end_i": 305,
  "points": [
    [33, 240, 100, 0],
    [193, 240, 100, 0]
  ],
  "units": { "speed": "kmh", "throttle": "pct", "brake": "pct" }
}
```

字段解释：
- `v`：版本号（当前固定为 1）
- `t_end_ms`：该圈结束时间（相对圈起点），单位 ms（通常≈ `lap_duration*1000`）
- `s1_end_ms`：S1 结束时间（相对圈起点），单位 ms；缺失则为 `null`
- `s2_end_ms`：S2 结束时间（相对圈起点），单位 ms；缺失则为 `null`
- `s1_end_i`：`points` 中“第一个满足 `t_ms >= s1_end_ms` 的索引”；缺失则为 `null`
- `s2_end_i`：`points` 中“第一个满足 `t_ms >= s2_end_ms` 的索引”；缺失则为 `null`
- `points`：按时间排序的点序列，每个点为：
  - `[t_ms, speed, throttle, brake]`
  - `t_ms`：相对圈起点的毫秒
  - `speed`：km/h（整型或 null）
  - `throttle`：百分比 0-100（整型或 null）
  - `brake`：百分比 0-100（整型或 null）
- `units`：单位说明

## 如何切分 S1/S2/S3

推荐按索引切分（稳定、无需再次扫描时间）：
- S1：`points[0 : s1_end_i+1]`（若 `s1_end_i` 为 null，则无法精确切分）
- S2：`points[s1_end_i : s2_end_i+1]`
- S3：`points[s2_end_i : ]`

兜底方案（当 `s1_end_i/s2_end_i` 缺失）：
- 使用 `s1_end_ms/s2_end_ms` 通过比较 `t_ms` 计算边界
- 若连 `s1_end_ms/s2_end_ms` 也缺失，则只能按点数比例 `1/3`、`2/3` 做近似切分

## 常用查询（SQL）

### 1) 查某 session 某车手有哪些圈已预计算

```sql
SELECT lap_number, date_start_utc, max_points, points_count
FROM openf1_lap_controls_series
WHERE session_key = ? AND driver_number = ?
ORDER BY lap_number ASC, date_start_utc ASC;
```

### 2) 查某圈的最佳版本（优先 max_points 最大）

```sql
SELECT *
FROM openf1_lap_controls_series
WHERE session_key = ? AND driver_number = ? AND lap_number = ?
ORDER BY max_points DESC, date_start_utc ASC
LIMIT 1;
```

### 3) 指定 max_points 版本（例如前端希望固定点数上限）

```sql
SELECT *
FROM openf1_lap_controls_series
WHERE session_key = ? AND driver_number = ? AND lap_number = ? AND max_points = ?
ORDER BY date_start_utc ASC
LIMIT 1;
```

## 如何写入（预计算脚本）

脚本： [openf1_precompute_lap_controls_series_mysql.py](file:///c:/Users/GinTonic/Desktop/zectrix/backend/scripts/openf1_precompute_lap_controls_series_mysql.py)

常用用法：
- 清表并对“已完赛 Race session”全量预计算：

```bash
python backend/scripts/openf1_precompute_lap_controls_series_mysql.py --truncate
```

- 指定单个 session 预计算：

```bash
python backend/scripts/openf1_precompute_lap_controls_series_mysql.py --session-key 9685
```

- 包含非 Race session（排位/练习）：

```bash
python backend/scripts/openf1_precompute_lap_controls_series_mysql.py --truncate --include-non-race
```

- 跑所有 session（不看是否完赛）：

```bash
python backend/scripts/openf1_precompute_lap_controls_series_mysql.py --truncate --all-sessions
```

顺序控制：
- 默认从最新 session 开始（session_key/date_end_utc 倒序）
- 如需从最早开始：

```bash
python backend/scripts/openf1_precompute_lap_controls_series_mysql.py --truncate --all-sessions --oldest-first
```

参数说明：
- `--max-points N`：写入时抽样点数上限（默认 900）
- `--overwrite`：强制重算并覆盖（否则会跳过同圈同 max_points 且 points_count>0 的记录）
- `--driver-number 44` / `--lap-number 12`：仅处理指定车手/圈号（可重复传参或用逗号）

## 使用注意

- `payload_json` 体积受 `max_points` 影响很大；建议按渲染目标选择合适 `max_points`
- `date_start_utc` 可能存在近似误差（来自 OpenF1），但同一套数据写入与读取使用同一字段即可稳定匹配
- 建议查询时优先选择 `max_points` 最大的记录（精度更好），或按客户端能力固定 `max_points`
