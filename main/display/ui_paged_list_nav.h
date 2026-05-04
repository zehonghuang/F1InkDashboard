#ifndef UI_PAGED_LIST_NAV_H
#define UI_PAGED_LIST_NAV_H

#include <algorithm>

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
                                          int& page,
                                          int page_count,
                                          int& row_focus,
                                          bool& page_changed) {
    page_changed = false;
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
            page = (page + (page_count - 1)) % page_count;
            page_changed = true;
            const int new_count = UiPagedListVisibleCount(total_rows, page, rows_per_page);
            row_focus = new_count > 0 ? (new_count - 1) : 0;
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
        page = (page + 1) % page_count;
        page_changed = true;
        row_focus = 0;
        return true;
    }
    row_focus = 0;
    return true;
}

#endif  // UI_PAGED_LIST_NAV_H

