# Overlay（文本/图片/菜单）与优先级（Overlay Z）

本文描述框架 Overlay 机制：以“覆盖层页面”的方式实现提示/弹层/快切菜单，并补充“OverlayItem level 优先级 + 图片层排除区域”的通用算法。

## 代码入口

- Overlay Z（OverlayItem 排序 + blocker + pic exclude）：  
  - [overlay_z.h](file:///c:/F1InkDashboard/main/display/overlay_z.h) / [overlay_z.cc](file:///c:/F1InkDashboard/main/display/overlay_z.cc)
- LcdDisplay 对外 API 与注册：  
  - [lcd_display.h](file:///c:/F1InkDashboard/main/display/lcd_display.h) / [lcd_display.cc](file:///c:/F1InkDashboard/main/display/lcd_display.cc)
- Overlay 页面实现（clean 分支）：
  - 文本： [overlay_text_page_adapter](file:///c:/F1InkDashboard/main/display/pages/overlay_text_page_adapter.cc)
  - 图片： [overlay_media_page_adapter](file:///c:/F1InkDashboard/main/display/pages/overlay_media_page_adapter.cc)
  - 菜单： [overlay_menu_page_adapter](file:///c:/F1InkDashboard/main/display/pages/overlay_menu_page_adapter.cc)

## 两类 Overlay：页面级 vs 页面内部

### 1) 页面级 Overlay（框架推荐）

作为独立 `UiPageId` 注册（例如 `OverlayText/OverlayMedia/OverlayMenu`），优点：

- 和主页面解耦：任何业务都能调用 `LcdDisplay::ShowXxxOverlay()`
- 全局页面栈管理：`Back()` 可统一关闭 overlay
- 事件派发简单：overlay 是当前活动页时，按键事件天然只到 overlay

### 2) 页面内部 Overlay（历史实现）

例如 F1 页面里的 `OverlayItem`（menu/quick-switch/alarm）是页面内部 LVGL root 的显示/隐藏与 Z 序管理。

如果某业务有“一个页面里多个内部遮罩/弹层”且不希望切全局页面，可以在业务页面内部复用 `overlay_z` 算法。

## LcdDisplay 对外 API（页面级 Overlay）

当前框架提供的 API：

- 文本提示：`ShowWsOverlay(text)`
- 图片提示：`ShowMemeOverlay(title, png_bytes)`
- 菜单/快切：`ShowMenuOverlay(title, items, selected)`
- 关闭：`HideWsOverlayIfVisible()` / `HideMenuOverlayIfVisible()` / 或直接 `Back()`
- 可见性：`IsWsOverlayVisible()` / `IsMenuOverlayVisible()`

调用者（Board/Service/业务）推荐只调用这些 API，不直接 `NavigateTo(UiPageId::OverlayXxx)`。

## Overlay 优先级与按键路由（ASCII）

```
按键输入（Up/Down/Confirm）
  |
  +--> 若强制提示 overlay 可见(OverlayText/OverlayMedia)
  |        Confirm: 关闭 overlay（Back）
  |        Up/Down: 通常忽略（避免底层页面变化）
  |
  +--> 若菜单 overlay 可见(OverlayMenu)
  |        Up/Down: PagePrev/PageNext -> 移动选中（循环）
  |        Confirm: 选中回调 + 关闭菜单（Back）
  |
  +--> 否则：主页面处理（PagePrev/PageNext/Confirm...）
```

## Overlay Z（OverlayItem level + blocker）是什么

Overlay Z 用于解决：**同时存在多种 overlay/root** 时，谁在最上层、以及“图片 overlay（Pic）在什么区域要避让 LVGL 输出”。

核心数据结构（通用版）：见 [OverlayItem](file:///c:/F1InkDashboard/main/display/overlay_z.h)

- `kind`：`Lvgl` 或 `Pic`
- `level`：优先级（越大越靠上）
- `visible`：当前是否显示
- `blocker`：用于计算“Pic 需要避让的矩形区域”（常用于弹窗 box）
- `fullscreen`：若为 true，则 Pic 全屏避让

### Overlay Z 的算法（ASCII）

```
items[]  (包含 Pic 与多个 Lvgl overlay root)
  |
  +--> 按 level 升序排序
  |
  +--> 找到 top_block = level 最大且 visible 的 Lvgl item（且 level > pic_level）
  |
  +--> 若 top_block.fullscreen:
  |        SetPicOverlayExcludeRect(true, 0,0,W,H)
  |    else if top_block.blocker:
  |        SetPicOverlayExcludeRect(true, blocker_rect)
  |    else:
  |        SetPicOverlayExcludeRect(false)
  |
  +--> 对所有 visible 的 Lvgl root 依次 move_foreground
```

## 业务侧如何复用 OverlayItem（页面内部）

如果你在“世界杯主页面”也要实现内部多 overlay（例如：服务重连/快切/菜单/图片遮罩），推荐做法：

1. 业务页内维护多个 `lv_obj_t* overlay_root`
2. 当 overlay 显示状态变化时，构造 `OverlayItem items[]`
3. 调用 `UpdateOverlayZ(host_display, items, count, pic_level)`

这样业务只关心“有哪些 overlay + level”，不需要复制一份排序/排除区域逻辑。

