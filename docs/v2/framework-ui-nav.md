# 页面内导航状态机（UiNavController）

本文描述 `UiNavController`：用于“一个全局页面里有多个内部视图/子视图”的导航状态机，和 `LcdDisplay` 的全局页面栈互补。

## 代码入口

- 控制器： [ui_nav.h](file:///c:/F1InkDashboard/main/display/ui_nav.h)
- 典型使用点（历史业务）：`F1PageAdapter`（仅用于理解；clean 分支业务已移除）

## 什么时候用 UiNavController

使用场景：

- 你希望“保持在同一个 `UiPageId` 页面里”，通过按键在多个内部视图间切换
- 内部视图之间切换只需要 show/hide 不同的 LVGL root，或者切换少量状态

不适用场景：

- 需要跨多个独立页面（应该用 `LcdDisplay::NavigateTo/Back`）
- 需要复杂多层级堆栈且每层都有独立 focus 模型（需要扩展策略或另写状态机）

## 模型概念

- **两套 root**：`root_a <-> root_b`（例如“赛事模式/关机模式”）
- **栈 stack_**：`[root]` 或 `[root, child]`
- **root focus slot**：root 上有 N 个“焦点槽位”（常见是 4 象限），Prev/Next 用于切换 focus

## 行为规则（ASCII）

```
Depth=1: stack=[root]
  Prev/Next  -> 切换 root focus -> Activate(root)
  Enter      -> ResolveChild(root, focus) -> push child -> Activate(child)
  ToggleRoot -> root_a <-> root_b (仅允许在 root 层)

Depth=2: stack=[root, child]
  Prev -> UiNavPrev(child)
          若返回 false -> Back() (pop 到 root)
  Next -> UiNavNext(child)
  Back -> pop 到 root -> Activate(root)
```

## Delegate 需要实现的接口（调用契约）

`UiNavController<Node, Delegate>` 不直接操作 LVGL，它通过 Delegate 回调让页面自己“应用视图”：

- root 层
  - `UiNavRootSlotCount(root)`
  - `UiNavRootFocus(root)`
  - `UiNavSetRootFocus(root, focus)`
  - `UiNavResolveChild(root, focus, out_child)`
- child 层
  - `UiNavPrev(node)`：返回 false 表示无法 Prev → 交由控制器 Back
  - `UiNavNext(node)`
- 通用
  - `UiNavActivate(node)`：把 node 映射为“显示哪个 LVGL root / 刷新哪些数据 / 进入哪个内部状态”

## 最小用法示例（伪代码）

```cpp
enum class NavNode { MainRoot, AltRoot, Menu, Detail };

class MyPage : public IUiPage {
  UiNavController<NavNode, MyPage> nav_{this, NavNode::MainRoot, NavNode::AltRoot};
  int root_focus_ = 0;

  int UiNavRootSlotCount(NavNode root) { return 4; }
  int UiNavRootFocus(NavNode root) { return root_focus_; }
  void UiNavSetRootFocus(NavNode root, int f) { root_focus_ = f; }
  bool UiNavResolveChild(NavNode root, int focus, NavNode& out) { out = NavNode::Detail; return true; }
  bool UiNavPrev(NavNode node) { return false; }
  void UiNavNext(NavNode node) {}
  void UiNavActivate(NavNode node) { /* show/hide roots */ }

  bool HandleEvent(const UiPageEvent& e) override {
    if (e.type != UiPageEventType::Custom) return false;
    switch (static_cast<UiPageCustomEventId>(e.i32)) {
      case UiPageCustomEventId::PagePrev: nav_.Prev(); return true;
      case UiPageCustomEventId::PageNext: nav_.Next(); return true;
      case UiPageCustomEventId::ConfirmClick: nav_.Enter(); return true;
      default: return false;
    }
  }
};
```

说明：

- 这套模式最适合“4 象限 home + Enter 进入某个 child view”的交互。
- 如果你要做“child 再 Enter 进入更深层”，建议优先用“child 内部局部状态机”（本工程原本也是这么做的），不要直接放开 UiNavController 的 Enter 限制。

