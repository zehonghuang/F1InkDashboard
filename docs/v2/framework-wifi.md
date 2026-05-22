# WiFi（配网 AP + Station + 事件）

本文描述 WiFi 框架模块的职责、典型调用方式、配网交互与事件链路。

## 代码入口

- WiFi 总控： [wifi_manager.cc](file:///c:/F1InkDashboard/main/components/78__esp-wifi-connect/wifi_manager.cc)
- Station（扫描/连接/重连/IP 快速恢复）： [wifi_station.cc](file:///c:/F1InkDashboard/main/components/78__esp-wifi-connect/wifi_station.cc)
- 配网 AP（SoftAP + Web 配网页 + Captive Portal + DNS 劫持）： [wifi_configuration_ap.cc](file:///c:/F1InkDashboard/main/components/78__esp-wifi-connect/wifi_configuration_ap.cc)
- DNS 劫持： [dns_server.h](file:///c:/F1InkDashboard/main/components/78__esp-wifi-connect/include/dns_server.h)
- 板级调用示例： [zectrix-s3-epaper-4.2.cc](file:///c:/F1InkDashboard/main/boards/zectrix-s3-epaper-4.2/zectrix-s3-epaper-4.2.cc)

## 模块职责

- `WifiManager`
  - 初始化 WiFi/NVS/netif/event loop
  - 启动 Station 或启动 Config AP
  - 向上层提供统一 `WifiEvent` 回调（Scanning/Connecting/Connected/Disconnected/ConfigModeEnter/Exit）
- `WifiStation`
  - 扫描周围热点、按保存的 SSID 生成候选队列、连接与掉线重连
  - 支持 “IP 快速恢复” 以提升短时掉线后的恢复速度
- `WifiConfigurationAp`
  - 启动 SoftAP + Web server，提供扫描与提交接口
  - Captive Portal：对常见探测 URL 返回 302，以便手机自动弹出“登录页”
  - DNS 劫持：将域名解析到 `192.168.4.1` 以提升配网页可达性

## 典型使用方式

### 1) 启动配网（Config AP）

适用于首次开机/无已保存 WiFi 的场景：

```
Board::StartWifiOnboarding()
  |
  +--> WifiManager::Initialize(config)
  +--> WifiManager::SetEventCallback(cb)
  +--> WifiManager::StartConfigAp()
```

### 2) 连接已保存 WiFi（Station）

```
Board::StartStationConnecting()
  |
  +--> WifiManager::Initialize(config)   // 若未初始化
  +--> WifiManager::SetEventCallback(cb)
  +--> WifiManager::StartStation()
```

## 配网交互（ASCII）

```
手机连 SoftAP
  |
  +--> 打开任意网址 / 系统探测 URL
         |
         +--> DNS 劫持到 192.168.4.1
         +--> Captive Portal 302 -> 配网页
                 |
                 +--> GET /scan        返回热点列表
                 +--> POST /submit     提交 ssid/pwd 并测试连接
                 +--> POST /advanced/submit
                       写入高级配置（例如 ota_url、websocket url 等）
                 |
                 +--> 保存成功 -> 退出 Config AP -> 进入 Station 连接
```

## 事件链路（WiFi → Application/服务）

```
WifiStation / WifiConfigAp
  |
  +--> WifiManager callback(WifiEvent)
          |
          +--> Board::HandleWifiEvent()
                 |
                 +--> Connected:
                 |      - TimeSyncService::RequestSync()
                 |      - Application::NotifyNetworkConnected()
                 |
                 +--> Disconnected:
                        - Application::NotifyNetworkDisconnected()
```

## NVS/配置键（约定）

以下键在配网页/系统内被使用（以实际代码为准）：

- WiFi 高级配置（namespace=`wifi`）
  - `ota_url`：OTA manifest 基地址（见 OTA 文档）
  - `max_tx_power` / `remember_bssid` / `sleep_mode`：WiFi 相关策略
- 时间（namespace=`time`）
  - `tz`、`sntp0`、`sntp1`

## 常见扩展点

- 新业务要增加“配网后自动跳转页面”：在 Board 的 WiFi 事件处理里调用 `display->ShowMainPage()` 或自定义页面切换即可。
- 新业务要增加“额外网络类型”（例如蜂窝/以太网）：建议保持 `NetworkInterface` 抽象不变，在 Board 内选择启动哪一种网络。

