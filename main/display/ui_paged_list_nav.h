#ifndef UI_PAGED_LIST_NAV_H
#define UI_PAGED_LIST_NAV_H

#include <algorithm>

/*
================================================================================
Paged list navigation helper (row focus + optional auto page turn)
================================================================================

This file is intentionally header-only because it is used by multiple UI pages
and the logic is tiny + needs to be inlined.

Terminology
-----------
  total_rows      : total rows in the whole dataset (may be 0)
  rows_per_page   : fixed rows per page (must be > 0 to have any rows)
  page            : current page index [0 .. page_count-1]
  page_count      : total pages (must be >= 1 when paging is enabled)
  row_focus       : focused row index within the CURRENT page [0 .. visible-1]
  visible         : rows visible in the CURRENT page (last page can be shorter)

Key design: UiPagedListMoveRowWithAutoPage() DOES NOT mutate `page`.
-----------
It only mutates:
  - row_focus (always clamped / updated)
  - page_dir  (0 / -1 / +1) to REQUEST a page change by the caller

Why not change `page` inside?
-----------------------------
The caller typically has extra duties when page changes:
  - update page label "PG x/y"
  - rebuild LVGL rows for that page
  - update selection highlight, trigger fetch, etc.

So this helper only answers:
  "Given current page+row_focus and a direction, what is the next row_focus,
   and should the caller turn the page?"

Behavior summary
----------------
dir == -1 (Up / Prev):
  if row_focus > 0:
    row_focus--
    page_dir = 0
  else (row_focus == 0):
    if page_count > 1:
      page_dir = -1            (caller should go to previous page)
      row_focus stays 0        (caller should re-position focus after page turn)
    else:
      row_focus = visible - 1  (wrap within single page)

dir == +1 (Down / Next):
  if row_focus + 1 < visible:
    row_focus++
    page_dir = 0
  else (row_focus at last visible row):
    if page_count > 1:
      page_dir = +1            (caller should go to next page)
      row_focus = 0            (defaults focus to first row on new page)
    else:
      row_focus = 0            (wrap within single page)

Typical caller-side page turn (circular)
----------------------------------------
Assume page_dir != 0:

  if (page_dir < 0) {                           // prev page
    page = (page + (page_count - 1)) % page_count;
    visible = UiPagedListVisibleCount(total_rows, page, rows_per_page);
    row_focus = (visible > 0) ? (visible - 1) : 0;  // focus last row
  } else {                                      // next page
    page = (page + 1) % page_count;
    row_focus = 0;                                  // focus first row
  }
  ApplyPage();   // rebuild / refresh page widgets

Edge cases / clamping rules
---------------------------
  - invalid inputs never crash; they clamp to a safe state and return false
  - when the current page has 0 visible rows (empty dataset), row_focus=0

ASCII example (total_rows=18, rows_per_page=8, page_count=3)
------------------------------------------------------------

  Page 0: rows [ 0.. 7] visible=8
  Page 1: rows [ 8..15] visible=8
  Page 2: rows [16..17] visible=2

  Focus at page=2, row_focus=1 (points to global row 17)
  Press Down:
    UiPagedListMoveRowWithAutoPage(+1, ...) => page_dir=+1, row_focus=0
    Caller turns page to 0, focus becomes first row of page 0.
================================================================================
*/

inline int UiPagedListVisibleCount(int total_rows, int page, int rows_per_page) {
    if (total_rows <= 0 || rows_per_page <= 0 || page < 0) {
        return 0;
    }
    const int start = page * rows_per_page;
    const int remain = total_rows - start;
    if (remain <= 0) {
        return 0;
    }
    return std::min(rows_per_page, remain);
}

inline bool UiPagedListMoveRowWithAutoPage(int dir,
                                          int total_rows,
                                          int rows_per_page,
                                          int page_count,
                                          int& row_focus,
                                          int page,
                                          int& page_dir) {
    page_dir = 0;
    if (dir != -1 && dir != 1) {
        return false;
    }
    if (page < 0) {
        page = 0;
    }
    if (page_count < 1) {
        page_count = 1;
    }
    if (page >= page_count) {
        page = page_count - 1;
    }
    const int count = UiPagedListVisibleCount(total_rows, page, rows_per_page);
    if (count <= 0) {
        row_focus = 0;
        return false;
    }
    if (row_focus < 0) {
        row_focus = 0;
    }
    if (row_focus >= count) {
        row_focus = count - 1;
    }

    if (dir < 0) {
        if (row_focus > 0) {
            row_focus--;
            return true;
        }
        if (page_count > 1) {
            page_dir = -1;
            return true;
        }
        row_focus = count - 1;
        return true;
    }

    if (row_focus + 1 < count) {
        row_focus++;
        return true;
    }
    if (page_count > 1) {
        page_dir = 1;
        row_focus = 0;
        return true;
    }
    row_focus = 0;
    return true;
}

#endif  // UI_PAGED_LIST_NAV_H
