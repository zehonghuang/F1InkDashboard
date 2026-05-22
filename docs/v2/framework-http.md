# HTTP 拉取（http_fetch）与 URL 工具（url_utils）

本文描述框架内“通用资源拉取”能力，目标是让 OTA/业务资源下载/图片下载等复用同一套实现，并避免依赖具体业务页面代码。

## 代码入口

- URL 工具： [url_utils.h](file:///c:/F1InkDashboard/main/common/url_utils.h) / [url_utils.cc](file:///c:/F1InkDashboard/main/common/url_utils.cc)
- HTTP GET→buffer： [http_fetch.h](file:///c:/F1InkDashboard/main/common/http_fetch.h) / [http_fetch.cc](file:///c:/F1InkDashboard/main/common/http_fetch.cc)

## 提供的能力

### 1) URL 处理

- `TrimUrl(std::string)`：去除首尾空白与引号（允许用户输入 `"https://..."` 这种）
- `BaseUrlFromApiUrl(api_url)`：从 URL 中提取 `scheme://host[:port]`
- `JoinUrl(base, path)`：支持相对路径拼接，若 `path` 已是绝对 URL 则原样返回

### 2) HTTP 拉取

- `HttpGetToBuffer(url, out, max_bytes)`
- `HttpGetToBufferEx(url, out, max_bytes, out_status, out_final_url, out_content_type)`

特点（见实现）：

- 内部有全局互斥，避免并发 HTTP 抢占资源（适合固件侧单通道下载）
- 支持最多 2 次 30x 重定向
- 通过 `max_bytes` 做硬上限，避免 OOM
- 使用 `esp_crt_bundle_attach` 处理 HTTPS 根证书
- 自动写入 `Accept-Language`（来自 `I18n`）

## 典型用法

### 拉取 JSON/小资源

```cpp
#include "common/http_fetch.h"

std::vector<uint8_t> bytes;
int status = 0;
std::string final_url;
if (HttpGetToBufferEx(url, bytes, 8 * 1024, &status, &final_url, nullptr)) {
    // bytes 即内容
}
```

### 拉取图片/音频（二进制）

```cpp
std::vector<uint8_t> bin;
if (HttpGetToBuffer(url, bin, 200 * 1024)) {
    // bin 可交给 PNG/音频解码
}
```

## 常见注意事项

- **不要把大文件用 `HttpGetToBuffer` 拉到 RAM**：固件 OTA bin 下载应使用流式读写（见 OTA 文档）。
- **互斥锁影响吞吐**：如果未来需要多路并发（例如同时拉多张图片），应在框架层扩展为“连接池/分通道锁”，而不是在业务里绕过锁。

