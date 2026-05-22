# SleepManager（限睡/延迟/投票）

本文描述框架的 SleepManager：用“投票 + deadline + hold”统一管理 light sleep 的进入条件，避免网络/音频/UI 刷新中误睡。

## 代码入口

- API： [sleep_manager.h](file:///c:/F1InkDashboard/main/common/sleep_manager.h)
- 使用点示例：
  - [application.cc](file:///c:/F1InkDashboard/main/application.cc)
  - [ota_update.cc](file:///c:/F1InkDashboard/main/common/ota_update.cc)
  - [time_sync.cc](file:///c:/F1InkDashboard/main/common/time_sync.cc)

## 核心概念

### 1) Busy vote（忙碌投票）

用 bitmask 表示“当前有哪些子系统不允许进入 sleep”：

- `SleepBusySrc::Net / Audio / Display / Ui / Nvs / Protocol ...`

API：

- `sm_set_busy(src, true/false)`

### 2) Kick（延迟截止时间）

用于“交互窗口/刷新窗口”：把 sleep 最早时间推迟到 `now + delay_ms`。

API：

- `sm_kick(delay_ms, reason)`

### 3) Hold（强制阻止）

用于“链路级阻止”（例如按键链、press-to-talk 等）：

- `sm_hold(reason)` / `sm_release(reason)`

## 进入 sleep 的门禁条件

`CanSleepNow()` 的逻辑（见接口注释）：

```
busy_mask == 0
AND hold_count == 0
AND now_ms >= deadline_ms
```

`PrepareForLightSleep()`：在真正睡之前调用，框架预留 hook 做“睡前动作”（例如 stop wifi）。

## 典型使用方式（ASCII）

```
开始网络操作（例如 OTA/时间同步）
  |
  +--> sm_set_busy(Net, true)
        |
        +--> 执行网络逻辑
        |
        +--> sm_set_busy(Net, false)

用户交互 / UI 刷新窗口
  |
  +--> sm_kick(30s, "btn/ui/overlay")
```

## 业务扩展规则（必须遵守）

- 任何“长网络请求/写 flash/长音频播放/长屏幕刷新”都必须在开始/结束时投票 busy。
- 任何“用户刚操作完需要保持唤醒”必须 kick 延迟窗口，避免刚按完键就睡。

