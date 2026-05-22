# Board / 按键 / 事件路由

本文描述 Board 层的职责（硬件初始化 + 输入汇聚 + 网络流程），以及按键事件如何转换为 `UiPageEvent` 并送达当前页面/overlay。

## 代码入口

- Board 抽象： [board.h](file:///c:/F1InkDashboard/main/boards/common/board.h)
- 按键封装： [button.cc](file:///c:/F1InkDashboard/main/boards/common/button.cc)
- 板级实现（示例）： [zectrix-s3-epaper-4.2.cc](file:///c:/F1InkDashboard/main/boards/zectrix-s3-epaper-4.2/zectrix-s3-epaper-4.2.cc)
- 页面事件定义： [ui_page.h](file:///c:/F1InkDashboard/main/display/ui_page.h)
- 事件派发： [lcd_display.cc](file:///c:/F1InkDashboard/main/display/lcd_display.cc)

## Board 的职责边界

- **负责**
  - 硬件初始化：电源/I2C/RTC/NFC/显示/按键等（具体板级文件）
  - 网络流程编排：何时进入配网、何时连接已保存 WiFi
  - 输入汇聚：GPIO 按键、组合键、长按等 → 翻译为 `UiPageEvent`
  - 将网络状态转换为 `Application` 事件（Connected/Disconnected）
- **不负责**
  - 不实现具体业务页面逻辑
  - 不在按键回调中直接操作复杂 LVGL UI（只投递事件/触发 Display API）

## 按键封装（Button）

`Button` 对底层 `iot_button` 做了封装，将事件映射为 C++ 回调：

- `OnClick/OnDoubleClick/OnLongPress`
- `OnPressDown/OnPressUp`

典型用法（板级代码中）：在构造/初始化阶段绑定回调（见 [zectrix-s3-epaper-4.2.cc](file:///c:/F1InkDashboard/main/boards/zectrix-s3-epaper-4.2/zectrix-s3-epaper-4.2.cc)）。

## 事件路由（ASCII）

```
GPIO Button
  |
  +--> Button (iot_button callback)
          |
          +--> Board lambda
                |
                +--> 组合键识别/抑制(suppress)
                |
                +--> 构造 UiPageEvent { type=Custom, i32=UiPageCustomEventId::X }
                |
                +--> display->DispatchPageEvent(e, only_active=true)
                          |
                          +--> UiPageRegistry::Dispatch()
                                  |
                                  +--> 当前活动页 IUiPage::HandleEvent()
```

## 组合键与 suppress（避免误触发）

板级实现会在 `PressDown` 时记录时间窗（例如 180ms），在窗口内如果同时按下多键则识别为组合键，并将相关单键事件 suppress，避免出现：

- 组合键触发后，松手又触发单键 Click/LongPress

这部分属于框架“输入层策略”，建议保持在 Board 层而非业务页面里。

## overlay / 菜单 / 快切的按键优先级（框架建议）

框架中建议把按键消费顺序固定下来，避免“overlay 开着但底层页面在变化”：

1. **强制遮挡类 overlay**（告警、服务重连等）优先消费 Confirm（用于关闭或提示）
2. **菜单/快切类 overlay** 消费 PagePrev/PageNext/Confirm（用于移动选中/确认）
3. **主页面** 再处理 Prev/Next/Confirm

`framework/clean` 当前示例：

- **下键长按** 在 `Home` 页面触发 `UiPageCustomEventId::MenuShow`（用于展示快切菜单）
- `OverlayMenu` 页面消耗 `PagePrev/PageNext/ConfirmClick`

## 新增业务时的推荐做法

- 新增一套“业务内快捷菜单/快切”：优先做成一个 overlay 页面（见 Overlay 文档），由 Board 发事件触发显示。
- 若某业务需要更复杂的“页面内部导航状态机”，再在业务页面内部使用 `UiNavController`（见 [ui_nav.h](file:///c:/F1InkDashboard/main/display/ui_nav.h)）。

