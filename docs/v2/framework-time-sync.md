# 时间同步（TimeSyncService / SNTP）

本文描述框架的时间同步服务：联网后通过 SNTP 拉取时间，写入系统时钟，并可回写到 Board（RTC/本地时间存储）。

## 代码入口

- API： [time_sync.h](file:///c:/F1InkDashboard/main/common/time_sync.h) / [time_sync.cc](file:///c:/F1InkDashboard/main/common/time_sync.cc)
- 触发点（示例）：板级 WiFi Connected 后调用 `RequestSync()`（见 Board 实现）

## 工作方式

- `RequestSync()`：
  - 若当前系统时间已是有效 epoch（`> 1700000000`）则直接标记为 `Synced`
  - 否则创建后台 task `SyncTask`
- `SyncTask`：
  - `sm_set_busy(Net, true)` 防止睡眠
  - 从 `Settings("time")` 读取：
    - `tz`（默认 `CST-8`）
    - `sntp0`（默认 `pool.ntp.org`）
    - `sntp1`（默认 `time.nist.gov`）
  - `esp_sntp_init()` 后轮询等待时间有效（最多约 15s）
  - 成功后 `Board::SetLocalTime(local_tm)`（用于 RTC/本地持久化，取决于板级实现）
  - 停止 sntp 并释放 busy

## 事件与状态（ASCII）

```
WiFi Connected
  |
  +--> TimeSyncService::RequestSync()
          |
          +--> SyncTask (FreeRTOS)
                |
                +--> sm_set_busy(Net,true)
                +--> Apply TZ (Settings "time".tz)
                +--> SNTP init + poll
                +--> set system time
                +--> Board::SetLocalTime()
                +--> sm_set_busy(Net,false)
```

## 业务扩展建议

- 如果世界杯业务需要“按赛事所在地切换时区”，可以只改 `Settings("time").SetString("tz", ...)` 并重新 `RequestSync()`。
- 如果未来需要“HTTP 获取时区/校时”，也应复用 `SleepManager` busy 投票，并保持服务侧不直接操作 UI（仅通过事件/通知提示）。

