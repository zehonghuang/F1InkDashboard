# 固件多语言（I18n）设计与开发指南

本文档描述 F1InkDashboard 固件侧多语言能力的现状、目标、落地实现、资源组织方式与后续扩展规则。目标是让后续任务可以直接按本文档继续开发与扩展。

## 范围与目标

### 本期范围（已落地）

- 固件侧文字资源国际化（zh-CN + en-US）
- 语言选择以设备设置为准（持久化到 NVS）
- en-US 作为 fallback（缺失 key 时回退到 en-US；仍缺失则回退到 key 本身）
- Wi-Fi 配网引导页（LVGL 页面）与配网流程状态文案接入 I18n
- F1 页面（Menu / Quick Switch / Race / Circuit / Sessions / Live / Offweek / Telemetry / WDC / WCC）主要静态文案接入 I18n
- Gallery 页面状态文案接入 I18n
- Factory Test 页面与 FactoryTestService 的提示/流程文案接入 I18n
- 板子 system info JSON 的 language 字段从设备设置读取
- 语言资源一致性校验脚本（对齐 key 集合）

### 不在本期范围（后续可做）

- 后端接口返回的错误信息/页面多语言
- charts 子站 / 微信小程序多语言
- 固件剩余页面/功能模块的国际化清扫（按页面逐步推进）
- 字体按语言动态切换、字体子集按语言裁剪

## 代码与资源位置

### 固件核心实现

- I18n 实现：[i18n.h](file:///c:/F1InkDashboard/main/i18n.h) / [i18n.cc](file:///c:/F1InkDashboard/main/i18n.cc)

提供能力：

- 语言读取/设置（NVS）
- 语言资源加载（从 assets 分区 SPIFFS 读取 JSON）
- 翻译查表（key -> 文案）

### 语言资源文件

- 英文资源：[language.json](file:///c:/F1InkDashboard/main/assets/locales/en-US/language.json)
- 简体中文资源：[language.json](file:///c:/F1InkDashboard/main/assets/locales/zh-CN/language.json)

资源会被打包进固件的 assets SPIFFS 分区（见 [main/CMakeLists.txt](file:///c:/F1InkDashboard/main/CMakeLists.txt) 中的 `spiffs_create_partition_image(assets ...)`）。

### 已接入 I18n 的页面/逻辑

- 低电量通知文案：[application.cc](file:///c:/F1InkDashboard/main/application.cc)
- Wi-Fi 配网引导 LVGL 页面：[wifi_setup_page_adapter.cc](file:///c:/F1InkDashboard/main/display/pages/wifi_setup_page_adapter.cc)
- Wi-Fi onboarding 状态文案与 Web 配网页语言参数（传入 WifiManagerConfig.language）：[zectrix-s3-epaper-4.2.cc](file:///c:/F1InkDashboard/main/boards/zectrix-s3-epaper-4.2/zectrix-s3-epaper-4.2.cc)
- system info JSON 的 language 字段：[board.cc](file:///c:/F1InkDashboard/main/boards/common/board.cc)
- F1 页面：
  - 主适配器与 WDC/WCC：[f1_page_adapter.cc](file:///c:/F1InkDashboard/main/display/pages/f1_page_adapter.cc)
  - Header 默认占位：[f1_page_adapter_common.cc](file:///c:/F1InkDashboard/main/display/pages/f1_page_adapter_common.cc)
  - Menu：[f1_page_adapter_ui_menu.cc](file:///c:/F1InkDashboard/main/display/pages/f1_page_adapter_ui_menu.cc)
  - Quick Switch：[f1_page_adapter_ui_quick_switch.cc](file:///c:/F1InkDashboard/main/display/pages/f1_page_adapter_ui_quick_switch.cc)
  - Race：[f1_page_adapter_ui_race.cc](file:///c:/F1InkDashboard/main/display/pages/f1_page_adapter_ui_race.cc)
  - Circuit：[f1_page_adapter_ui_circuit.cc](file:///c:/F1InkDashboard/main/display/pages/f1_page_adapter_ui_circuit.cc)
  - Sessions：[f1_page_adapter_ui_sessions.cc](file:///c:/F1InkDashboard/main/display/pages/f1_page_adapter_ui_sessions.cc)
  - Live：[f1_page_adapter_ui_live.cc](file:///c:/F1InkDashboard/main/display/pages/f1_page_adapter_ui_live.cc)
  - Offweek：[f1_page_adapter_ui_offweek.cc](file:///c:/F1InkDashboard/main/display/pages/f1_page_adapter_ui_offweek.cc)
  - Telemetry UI：[f1_page_adapter_ui_telemetry.cc](file:///c:/F1InkDashboard/main/display/pages/f1_page_adapter_ui_telemetry.cc)
  - Telemetry 渲染：[f1_page_adapter_telemetry.cc](file:///c:/F1InkDashboard/main/display/pages/f1_page_adapter_telemetry.cc)
- Gallery 页面：[gallery_page_adapter.cc](file:///c:/F1InkDashboard/main/display/pages/gallery_page_adapter.cc)
- Factory Test 页面：[factory_test_page_adapter.cc](file:///c:/F1InkDashboard/main/display/pages/factory_test_page_adapter.cc)
- FactoryTestService：[factory_test_service.cc](file:///c:/F1InkDashboard/main/boards/zectrix-s3-epaper-4.2/FT/factory_test_service.cc)

## 语言选择策略

### 持久化位置（NVS）

- Namespace：`i18n`
- Key：`language`
- 默认值：`zh-CN`

读取逻辑（概念）：

- 如果 `i18n.language` 存在且非空，使用它
- 否则使用默认 `zh-CN`

设置逻辑（概念）：

- 调用 `I18n::SetLanguage("en-US")` 会写入 NVS，并重新加载翻译表

## 资源格式与约定

### language.json 格式

每个语言目录必须包含 `language.json`，格式如下：

```json
{
  "language": "en-US",
  "strings": {
    "some.key": "some text"
  }
}
```

说明：

- 顶层 `language` 字段目前仅用于人类阅读与一致性检查（当前实现不会强制校验）
- `strings` 必须是 object，key 为字符串 key，value 为字符串文案
- key 统一使用点号分层命名，便于检索与归类，例如：
  - `ui.*`：通用 UI
  - `wifi.*`：Wi-Fi 相关

### fallback 规则

I18n 加载时会按顺序 merge：

1. 先加载 `en-US`
2. 再加载当前语言（例如 `zh-CN`），覆盖同名 key

运行时查找：

- 命中：返回对应翻译
- 未命中：返回 key 本身（让缺失可见）

## 固件侧使用方式

### 初始化

在固件启动时尽早调用：

- `I18n::Init()`

当前初始化点位于：

- [Application::Initialize](file:///c:/F1InkDashboard/main/application.cc)

### 获取当前语言

- `I18n::GetLanguage() -> std::string`

典型用途：

- 给 Wi-Fi 配网页传递 `lang` 参数（WifiManagerConfig.language）
- 给后端 HTTP 请求添加 `Accept-Language` 请求头

### 翻译字符串

- `I18n::Tr("some.key") -> const char*`

典型用途：

- LVGL 文本
- 系统通知
- 日志不建议做多语言（保持英文/固定格式更利于排障）

示例（概念）：

- `lv_label_set_text(label, I18n::Tr("wifi.setup.title"));`

### 格式化字符串（带 %s / %d）

如果 key 对应的 value 是格式化模板，可以直接配合 LVGL 的 `*_set_text_fmt` 使用：

- `lv_label_set_text_fmt(label, I18n::Tr("wifi.setup.ap_ssid_fmt"), ssid);`

约束：

- 模板内容需要符合 C `printf` 风格
- zh/en 两边的参数数量与类型必须一致

## 开发流程（新增文案/新增语言）

### 1) 新增一个可翻译文案

1. 选一个新 key（遵守命名空间约定）
2. 在 `en-US` 与 `zh-CN` 的 `strings` 中同时补齐该 key
3. 在 C/C++ 代码中将硬编码文本替换为 `I18n::Tr("key")`
4. 如果是 `lv_label_set_text_fmt` 场景，使用 `*_fmt` 的 key

建议：

- key 一旦发布尽量不要改名（会导致旧资源与代码不一致）
- 文案里不要塞入动态数据，动态数据应通过格式化参数传入

### 2) 新增一种语言（例如 ja-JP）

1. 新建目录：`main/assets/locales/ja-JP/`
2. 新建 `language.json`
3. 最低要求：把当前已存在的 key 全量补齐（可先复制 `en-US` 再逐步翻译）
4. 通过 `I18n::SetLanguage("ja-JP")` 或预置 NVS 设置验证显示效果

## 已落地 key 列表

当前已使用的 key（按命名空间）：

- `ui.*`：通用 UI（占位符、表头、通用状态）
- `wifi.*`：配网流程
- `f1.*`：F1 页面静态文案
- `gallery.*`：Gallery 页面状态
- `factory_test.*`：出厂测试流程与页面

对应资源见：

- [en-US/language.json](file:///c:/F1InkDashboard/main/assets/locales/en-US/language.json)
- [zh-CN/language.json](file:///c:/F1InkDashboard/main/assets/locales/zh-CN/language.json)

## 语言资源一致性校验

用于保证“语言包是否完整”，避免出现只补了某一种语言的情况。

- 校验脚本：[check_i18n_keys.py](file:///c:/F1InkDashboard/scripts/check_i18n_keys.py)
- 校验内容：
  - 以 `en-US` 为基准（若不存在则取第一种语言）
  - 对比所有 `main/assets/locales/*/language.json` 的 key 集合
  - 输出 missing/extra key 列表并返回非 0 退出码

## 不建议本地化的内容（规则）

- 设备日志（ESP_LOG*）不建议做多语言
- 运行时数据字段（来自 API 或设备状态的缩写/码值）不建议强行翻译，例如：`PIT/OUT/FLY` 等
- 数字、时间戳、URL、SSID 等数据本体不翻译，只翻译其“描述性标签”

## 常见问题与排查

### 1) 翻译不生效

检查顺序：

1. assets 分区是否正常挂载（`EnsureAssetsMounted()`）
2. `main/assets/locales/<lang>/language.json` 是否被打包进固件（SPIFFS image）
3. JSON 是否可解析（格式是否正确）
4. key 是否拼写一致（大小写与点号分隔一致）

### 2) 某些文本显示为 key 本身

说明该 key 在当前语言与 en-US 中均缺失，或加载失败导致字典为空。

## 后续扩展建议

- 将固件 UI 里散落的中文/英文硬编码逐步替换为 key（可以按页面逐个清扫）
- 如果后续要支持更多语言且资源体积变大：
  - 考虑把部分语言资源改为按需加载
  - 或将语言资源做压缩/分段存储
- 如果要做字体跟随语言：
  - 需要定义“语言 -> 字体集”映射，并在 LVGL theme 中按语言选择字体
