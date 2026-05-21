# UI Nav Buttons Logic (F1)

This document describes how the physical buttons are translated into UI events,
and how those events are routed inside the F1 page (including paged list focus
movement and subpage switching).

## 1. Physical buttons -> UI events

Board implementation: [zectrix-s3-epaper-4.2.cc](file:///c:/Users/GinTonic/Desktop/zectrix/main/boards/zectrix-s3-epaper-4.2/zectrix-s3-epaper-4.2.cc#L567-L780)

```text
Up button
  Click         -> UiPageCustomEventId::PagePrev
  DoubleClick   -> UiPageCustomEventId::PagePrevDoubleClick
  LongPress     -> UiPageCustomEventId::JumpOffWeek
  LongPress+Down(Combo) -> UiPageCustomEventId::ComboUpDown

Down button
  Click         -> UiPageCustomEventId::PageNext
  DoubleClick   -> UiPageCustomEventId::PageNextDoubleClick
  LongPress     -> UiPageCustomEventId::QuickSwitchShow
  LongPress+Up(Combo) -> UiPageCustomEventId::ComboUpDown

Confirm button
  Click         -> UiPageCustomEventId::ConfirmClick
  DoubleClick   -> UiPageCustomEventId::ConfirmDoubleClick
  LongPress     -> UiPageCustomEventId::ConfirmLongPress
```

Event IDs definition: [ui_page.h](file:///c:/Users/GinTonic/Desktop/zectrix/main/display/ui_page.h#L23-L50)

## 2. Global suppression / overlay handling (before reaching F1 page)

Board layer short-circuits some inputs:

```text
If WS overlay is visible:
  Up/Down click/double/long do nothing (prevent background navigation)

Confirm click:
  1) If raw 1bpp frame is visible: hide it first (then refresh)
  2) Else if WS overlay is visible: hide it first (then refresh)
  3) Else dispatch ConfirmClick to active page (F1)
```

Relevant code: [zectrix-s3-epaper-4.2.cc](file:///c:/Users/GinTonic/Desktop/zectrix/main/boards/zectrix-s3-epaper-4.2/zectrix-s3-epaper-4.2.cc#L604-L737)

## 3. F1 page routing priority

Entry point: [F1PageAdapter::HandleEvent](file:///c:/Users/GinTonic/Desktop/zectrix/main/display/pages/f1_page_adapter.cc#L831-L1320)

The key point is that PagePrev/PageNext are context-dependent. F1 uses an
explicit priority order to keep overlay behavior stable:

```text
Highest priority (if visible):
  QuickSwitch overlay  : PagePrev/PageNext move focus within overlay list
  Menu overlay         : PagePrev/PageNext move focus within menu list

RaceSessions internal navigation:
  - Telemetry subpage  : PagePrev/PageNext changes selected driver (from results)
  - Quali/Race results : PagePrev/PageNext moves row focus + optional page turn
  - Other subpages     : (no special list behavior here)

Fallback:
  PagePrev -> nav_.Prev()
  PageNext -> nav_.Next()
```

## 3.1 UiNavController: 页面组织数据结构（F1 内部）

Implementation: [ui_nav.h](file:///c:/Users/GinTonic/Desktop/zectrix/main/display/ui_nav.h)  
F1 integration: [f1_page_adapter.h](file:///c:/Users/GinTonic/Desktop/zectrix/main/display/pages/f1_page_adapter.h#L39-L131) / [f1_page_adapter.cc](file:///c:/Users/GinTonic/Desktop/zectrix/main/display/pages/f1_page_adapter.cc#L1882-L2013)

```text
UiPageId::F1 (global page, owned by LcdDisplay)
  |
  |-- F1PageAdapter internal nav (UiNavController<NavNode>)
        - root_a = RaceRoot
        - root_b = OffRoot
        - stack_ = [root] or [root, child]

RaceRoot / OffRoot are 2x2 quadrants (4 slots)
  - PagePrev/PageNext at root: cycles focus slot (wrap) and re-activates root
  - Confirm (Enter): resolves focused quadrant -> child node (Wdc/Wcc/Circuit/...)

When inside child (stack depth > 1):
  - PagePrev: calls UiNavPrev(child); if returns false -> Back() to root
  - PageNext: calls UiNavNext(child)
```

## 4. PagePrev / PageNext behavior matrix (F1)

```text
Legend:
  "focus++/--" means row/entry focus changes inside current view.
  "page turn" means caller changes page index and rebuilds LVGL rows.

Context                             PagePrev (Up click)                PageNext (Down click)
------------------------------------------------------------------------------------------------
QuickSwitch overlay visible          focus-- (wrap)                     focus++ (wrap)
Menu overlay visible                focus-- (wrap)                     focus++ (wrap)
RaceSessions / Telemetry subpage    select previous driver             select next driver
RaceSessions / QualiResult subpage  focus-- + optional page turn        focus++ + optional page turn
RaceSessions / RaceResult subpage   focus-- + optional page turn        focus++ + optional page turn
Other contexts (no overlay)         nav_.Prev()                         nav_.Next()
```

## 5. Double-click (PagePrevDoubleClick / PageNextDoubleClick)

Only active when current NavNode is RaceSessions AND current subpage is NOT
Telemetry.

```text
PagePrevDoubleClick : race_sessions_page_ = (cur + 3) % 4   (cycle backward)
PageNextDoubleClick : race_sessions_page_ = (cur + 1) % 4   (cycle forward)
```

Code: [f1_page_adapter.cc](file:///c:/Users/GinTonic/Desktop/zectrix/main/display/pages/f1_page_adapter.cc#L1012-L1045)

## 6. Paged list row focus + auto page turn

Helper implementation: [ui_paged_list_nav.h](file:///c:/Users/GinTonic/Desktop/zectrix/main/display/ui_paged_list_nav.h)

The helper is designed to keep "page state ownership" in the caller:

```text
UiPagedListMoveRowWithAutoPage(dir, ...)
  inputs :
    - current page (value) + row_focus (in/out)
    - total_rows, rows_per_page, page_count
  outputs:
    - row_focus updated/clamped
    - page_dir in {-1,0,+1} indicating whether the caller should turn the page
  does NOT:
    - mutate `page` (caller updates page + rebuilds UI)
```

Typical integration pattern in F1 RaceSessions results:

```text
dir = -1 / +1
page_dir = 0

UiPagedListMoveRowWithAutoPage(dir, total_rows, rows_per_page, page_count,
                               row_focus, page, page_dir)

if (page_dir != 0 && page_count > 1) {
  if (page_dir < 0) {
    page = (page + (page_count - 1)) % page_count
    row_focus = last row of new page (visible - 1)
  } else {
    page = (page + 1) % page_count
    row_focus = 0
  }
  ApplyPageLocked()
} else {
  ApplyResultRowSelectionLocked()
}
```

Why "prev page => focus last row"?

```text
User expectation:
  When pressing Up at the first row of a page, they want to land on the last
  row of the previous page (continuous scrolling feel).
```
