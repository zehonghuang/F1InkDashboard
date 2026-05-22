# Settings（NVS KV 存储）

本文描述框架的 Settings 封装：用于在 NVS 中按 namespace 存取 key-value 配置，并约定哪些模块读写哪些命名空间。

## 代码入口

- API： [settings.h](file:///c:/F1InkDashboard/main/settings.h) / [settings.cc](file:///c:/F1InkDashboard/main/settings.cc)

## 基本用法

### 只读

```cpp
Settings s("wifi", false);
std::string ota = s.GetString("ota_url", "");
int32_t power = s.GetInt("max_tx_power", 0);
bool remember = s.GetBool("remember_bssid", false);
```

### 读写（析构时 commit）

```cpp
{
  Settings s("wifi", true);
  s.SetString("ota_url", "https://example.com/ota/");
  s.SetBool("remember_bssid", true);
} // ~Settings() 内部自动 nvs_commit
```

## 语义与注意事项

- `Settings(ns, read_write=false)`：namespace 以字符串区分（例如 `wifi/time/ota/websocket`）
- 写入会设置 `dirty_`，在析构时 `nvs_commit`（见 [settings.cc](file:///c:/F1InkDashboard/main/settings.cc)）
- 如果用只读方式打开却调用 Set，会 log warning（不生效）

## 推荐的命名空间约定

框架建议按模块划分 namespace，避免“全局一锅粥”：

- `wifi`：WiFi 配置与高级配置（例如 `ota_url`）
- `ota`：OTA 策略（例如 `check_interval_ms`）
- `time`：时区与 sntp server
- `sleep`：light sleep 开关/策略
- `display`：主题/显示策略

## 配置流转（ASCII）

```
配网页(HTTP POST)
  |
  +--> WifiConfigurationAp 写入 Settings("wifi")
          |
          +--> Station 连接成功
                  |
                  +--> Application/Service 读取 Settings
                        - OTA 读 wifi.ota_url
                        - TimeSync 读 time.tz / time.sntp0/1
```

