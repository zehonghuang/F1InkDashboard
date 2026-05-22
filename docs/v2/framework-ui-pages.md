# UI 页面系统（IUiPage / UiPageRegistry / LcdDisplay）

本文描述框架的 UI 页面组织方式：页面接口、页面注册表、全局页面栈（Navigate/Back）、以及事件派发模型。

## 代码入口

- 页面接口/事件： [ui_page.h](file:///c:/F1InkDashboard/main/display/ui_page.h)
- 页面注册表： [ui_page_registry.h](file:///c:/F1InkDashboard/main/display/ui_page_registry.h) / [ui_page_registry.cc](file:///c:/F1InkDashboard/main/display/ui_page_registry.cc)
- UI 宿主： [lcd_display.h](file:///c:/F1InkDashboard/main/display/lcd_display.h) / [lcd_display.cc](file:///c:/F1InkDashboard/main/display/lcd_display.cc)

## 页面接口：IUiPage

每个页面实现 `IUiPage`（见 [ui_page.h](file:///c:/F1InkDashboard/main/display/ui_page.h)）：

- `Id()`：全局唯一页面 ID（`UiPageId`）
- `Name()`：用于日志/调试
- `Build()`：构建 LVGL 控件树（建议幂等）
- `Screen()`：返回页面 root screen（`lv_obj_t*`）
- `OnShow()/OnHide()`：切入/切出时回调
- `HandleEvent(event)`：消费 `UiPageEvent`（按键、服务事件、业务事件）

## 页面注册与切换

`UiPageRegistry` 提供：

- `Register(page)`：注册页面（Id 不可重复）
- `SwitchTo(id)`：切到指定页面
- `Dispatch(event, only_active)`：派发事件到页面

`LcdDisplay` 在其上提供“全局页面栈”：

- `NavigateTo(id)`：入栈并切页
- `Back()`：出栈回到上一页

## 页面栈与切页（ASCII）

```
Register pages at boot:
  LcdDisplay::SetupUI()
    - RegisterPage(FactoryTest)
    - RegisterPage(WifiSetup)
    - RegisterPage(Home)
    - RegisterPage(OverlayText/OverlayMedia/OverlayMenu)

Navigation:
  NavigateTo(PageX)
    push PageX to stack_
    SwitchPageLocked(PageX)
      UiPageRegistry::SwitchTo(PageX)
        - old_page.OnHide()
        - new_page.Build()
        - lv_screen_load(new_page.Screen())
        - new_page.OnShow()

  Back()
    pop stack_
    SwitchPageLocked(stack_.back())
```

## 事件派发（ASCII）

```
Board / Service
  |
  +--> LcdDisplay::DispatchPageEvent(e, only_active=true/false)
           |
           +--> UiPageRegistry::Dispatch(e, only_active)
                 |
                 +--> ActivePage::HandleEvent(e)     (only_active=true)
                 |
                 +--> For each page HandleEvent(e)   (only_active=false)
```

建议：

- 业务服务的“数据更新”通常用 `only_active=false` 广播（由页面自行判断是否处理）。
- 按键事件通常用 `only_active=true`，只让当前活动页消费。

## 如何新增一个页面（最小步骤）

1. 定义新的 `UiPageId`
   - 编辑 [ui_page.h](file:///c:/F1InkDashboard/main/display/ui_page.h)
2. 补齐 `UiPageIdName()`
   - 编辑 [ui_page_registry.cc](file:///c:/F1InkDashboard/main/display/ui_page_registry.cc)
3. 新建页面适配器（继承 `IUiPage`）
   - 推荐放在 `main/display/pages/`
4. 在 `LcdDisplay::SetupUI()` 中注册
   - 编辑 [lcd_display.cc](file:///c:/F1InkDashboard/main/display/lcd_display.cc)
5. 在 Board 或业务逻辑中调用 `NavigateTo()` 切页，或投递事件让页面自行切换

## 线程/锁约定

LVGL 不是线程安全的。框架通过 `DisplayLockGuard`（调用 `lvgl_port_lock/unlock`）保护对 UI 的访问：

- `LcdDisplay` 对外 API（Switch/Navigate/Dispatch/ShowOverlay）内部都会加锁
- 页面 `Build/OnShow/HandleEvent` 一般运行在 UI 相关线程/调用方已持锁的上下文

新增业务时的规则：

- 不要在任意 FreeRTOS task 里直接操作 LVGL 对象；应使用 `DispatchPageEvent` 或 `lv_async_call` 方式回到 UI 上下文。

