# OTA 更新（OtaUpdateService）

本文描述框架 OTA 服务的工作方式（manifest 拉取、版本比较、流式下载写分区、切换启动分区），以及与 WiFi/Sleep 的交互。

## 代码入口

- 服务： [ota_update.h](file:///c:/F1InkDashboard/main/common/ota_update.h) / [ota_update.cc](file:///c:/F1InkDashboard/main/common/ota_update.cc)
- HTTP： [http_fetch.h](file:///c:/F1InkDashboard/main/common/http_fetch.h)
- Settings： [settings.h](file:///c:/F1InkDashboard/main/settings.h)

## OTA URL 选择规则

`BuildManifestUrlLocked()`（见实现）按优先级选择 base：

1. NVS：`Settings("wifi").GetString("ota_url")`
2. 编译期：`CONFIG_OTA_URL`（如果定义）

拼接规则：

- 若 base 以 `.json` 结尾：认为已是 manifest 完整 URL
- 若 base 以 `/update` 结尾：拼 `/manifest.json`
- 否则：拼 `/update/manifest.json`

## 状态机与触发方式

- `NotifyNetworkConnected()`：联网后允许自动检查（由 Application/Board 驱动）
- `RequestCheck()`：请求一次检查（可用于 UI 手动触发）
- `RequestUpdateNow()`：立刻下载并应用（需要 `UpdateAvailable`）

后台线程 `WorkerLoop()` 周期工作：

- 到达检查间隔或收到强制检查请求 → 拉取 manifest → 判断是否有新版本
- `update_requested_` 且 `UpdateAvailable` → 下载并写入 OTA 分区 → 设置启动分区 → 重启

## 数据流（ASCII）

```
WiFi Connected
  |
  +--> Application::NotifyNetworkConnected()
          |
          +--> OtaUpdateService::NotifyNetworkConnected()
                  |
                  +--> WorkerLoop()
                        |
                        +--> GET manifest.json (HttpGetToBufferEx, <=8KB)
                        +--> 解析 version / bin_url / board
                        +--> 若可更新:
                        |      State=UpdateAvailable
                        |
                        +--> 若 RequestUpdateNow:
                               - sm_set_busy(Net, true)
                               - esp_ota_begin(next_partition)
                               - esp_http_client_read() -> esp_ota_write() (流式)
                               - esp_ota_end()
                               - esp_ota_set_boot_partition()
                               - esp_restart()
```

## 与 SleepManager 的配合

OTA 在网络请求与写分区期间会投票为 busy，防止进入 light sleep：

- `sm_set_busy(SleepBusySrc::Net, true/false)`

业务新增时的规则：

- 任何“长网络操作/写 Flash 操作”都应在开始/结束时对 SleepManager 投票。

## 业务侧如何做“多固件/多产品 OTA”

框架 OTA 本身只关心 `manifest_url` 与 `bin_url`，服务端可以按产品线维护不同 manifest：

- F1：`.../update/manifest.json`
- WorldCup：`.../worldcup/update/manifest.json`

客户端选择后只需写入不同的 `wifi.ota_url`（或不同的 `CONFIG_OTA_URL`），即可复用同一套 OTA 逻辑。

