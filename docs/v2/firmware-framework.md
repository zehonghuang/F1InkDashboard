# 固件框架抽象（可复用底座）

本文档以“同一硬件上支持多套业务固件/多套业务 UI”为目标，梳理当前工程里可复用的底座模块边界，并标注业务耦合点与推荐抽象切入点。

更细的“每个机制一份使用说明 + ASCII 交互图”见： [framework-index.md](file:///c:/F1InkDashboard/docs/v2/framework-index.md)

## 总体分层

- **Board（硬件与输入汇聚）**：负责硬件初始化、按键/组合键识别、WiFi 配网/联网流程、把“物理输入/网络状态”翻译成应用/页面事件。
- **Application（应用主循环与系统策略）**：统一收敛“联网/断网/恢复模式/周期 Tick”等事件，驱动 OTA、休眠策略、状态栏刷新。
- **Display（UI 宿主）**：LVGL 与 EPD flush 集成；页面注册表 + 页面栈；页面事件派发；overlay/临时页面显示。
- **Services（后台服务）**：OTA、时间同步、WS 客户端、资源下载等；与 UI 交互尽量通过事件或异步回调解耦。

## 入口与主循环

- 入口为 [main.cc](file:///c:/F1InkDashboard/main/main.cc)：`app_main()` 初始化 NVS 后启动 `Application::Initialize()` / `Application::Run()`
- 应用主循环 [application.cc](file:///c:/F1InkDashboard/main/application.cc)：基于 queue 收事件，超时走 `Tick()`（状态栏更新、低电提示、light sleep 判定等）

## 硬件与按键（Board 层）

- 板级实现：以 [zectrix-s3-epaper-4.2.cc](file:///c:/F1InkDashboard/main/boards/zectrix-s3-epaper-4.2/zectrix-s3-epaper-4.2.cc) 为例
  - 初始化：电源/I2C/RTC/NFC/显示/按键等
  - 组合键窗口与 suppress：将组合键识别与单键事件互斥
- 按键底座封装：`Button`（GPIO/ADC -> iot_button -> C++ 回调）见 [button.cc](file:///c:/F1InkDashboard/main/boards/common/button.cc)
- 页面事件模型：`UiPageEvent` + `UiPageCustomEventId` 见 [ui_page.h](file:///c:/F1InkDashboard/main/display/ui_page.h)

## WiFi 检测/配网/联网（网络底座）

- 总控：`WifiManager` 负责启动 Station/ConfigAP 并对上层回调 WiFi 事件  
  - [wifi_manager.cc](file:///c:/F1InkDashboard/main/components/78__esp-wifi-connect/wifi_manager.cc)
- Station：扫描、候选 AP 队列、重连、IP 快速恢复  
  - [wifi_station.cc](file:///c:/F1InkDashboard/main/components/78__esp-wifi-connect/wifi_station.cc)
- 配网 AP：SoftAP + Web 配网页 + 高级配置（含 OTA URL、WS URL）  
  - [wifi_configuration_ap.cc](file:///c:/F1InkDashboard/main/components/78__esp-wifi-connect/wifi_configuration_ap.cc)

## HTTP client（资源/接口拉取）

- 为了避免业务模块直接依赖页面代码，工程已抽出通用的“同步 GET -> buffer”能力：  
  - [http_fetch.h](file:///c:/F1InkDashboard/main/common/http_fetch.h) / [http_fetch.cc](file:///c:/F1InkDashboard/main/common/http_fetch.cc)
- URL 处理（Trim/Join/BaseUrl）：  
  - [url_utils.h](file:///c:/F1InkDashboard/main/common/url_utils.h) / [url_utils.cc](file:///c:/F1InkDashboard/main/common/url_utils.cc)

## OTA（manifest 拉取 -> bin 下载 -> 写分区 -> 切换启动）

- 服务实现：`OtaUpdateService` 见 [ota_update.cc](file:///c:/F1InkDashboard/main/common/ota_update.cc)
  - manifest 拉取复用 `HttpGetToBufferEx()`
  - bin 下载使用 `esp_http_client_read` 流式写 `esp_ota_write`，避免整包进 RAM

## UI 页面组织（Display 层）

- UI 框架：LVGL（`lvgl__lvgl` + `espressif__esp_lvgl_port`）
- 页面抽象：`IUiPage`（Build/OnShow/OnHide/HandleEvent）见 [ui_page.h](file:///c:/F1InkDashboard/main/display/ui_page.h)
- 页面注册/切换/事件派发：`UiPageRegistry` 见 [ui_page_registry.cc](file:///c:/F1InkDashboard/main/display/ui_page_registry.cc)
- 页面栈（Back/NavigateTo）：`LcdDisplay` 见 [lcd_display.cc](file:///c:/F1InkDashboard/main/display/lcd_display.cc)
- 板级显示集成（面板 flush / EPD 刷新策略）：`CustomLcdDisplay` 见 [custom_lcd_display.cc](file:///c:/F1InkDashboard/main/boards/zectrix-s3-epaper-4.2/custom_lcd_display.cc)
- 覆盖层（Overlay）Z 序/阻挡：`OverlayItem` + `UpdateOverlayZ()` 见 [overlay_z.cc](file:///c:/F1InkDashboard/main/display/overlay_z.cc)

## 业务抽象切入点（为多业务/多赛事做准备）

- **主页面与系统策略解耦**：通过 [app_profile.h](file:///c:/F1InkDashboard/main/app_profile.h) 将“主页面 ID / 允许 light sleep 的页面”等策略从 `Application/Board` 中抽离，避免硬编码业务页面枚举。
- **网络与资源拉取解耦**：把 `HttpGetToBufferEx/TrimUrl/JoinUrl` 放到 `common/`，避免 OTA/WS 等底座能力依赖业务页面实现。
- **下一步推荐（多业务并存）**：
  - 将 `display/pages/` 下的业务页面（例如 F1、世界杯）拆到 `products/<name>/`，在 `app_profile` 或 “产品注册表”里选择注册哪组页面。
  - 将业务服务（例如特定 WS 协议解析、业务缓存、赛事规则）下沉到 `products/<name>/services/`，仅通过 `UiPageEvent` 或 display 的抽象 API 与 UI 交互。

