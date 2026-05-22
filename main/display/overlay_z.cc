#include "overlay_z.h"

#include "display.h"

#include <algorithm>
#include <vector>

void UpdateOverlayZ(Display* host, const OverlayItem* items, size_t count, int pic_level) {
    if (items == nullptr || count == 0) {
        if (host != nullptr) {
            host->SetPicOverlayExcludeRect(false, 0, 0, 0, 0);
        }
        return;
    }

    std::vector<OverlayItem> sorted(items, items + count);
    std::sort(sorted.begin(), sorted.end(), [](const OverlayItem& a, const OverlayItem& b) {
        return a.level < b.level;
    });

    OverlayItem* top_block = nullptr;
    for (auto& it : sorted) {
        if (it.kind != OverlayKind::Lvgl || !it.visible) {
            continue;
        }
        if (it.level <= pic_level) {
            continue;
        }
        if (top_block == nullptr || it.level > top_block->level) {
            top_block = &it;
        }
    }

    if (host != nullptr) {
        if (top_block != nullptr) {
            if (top_block->fullscreen) {
                host->SetPicOverlayExcludeRect(true, 0, 0, host->width(), host->height());
            } else if (top_block->blocker != nullptr) {
                lv_area_t a{};
                lv_obj_get_coords(top_block->blocker, &a);
                host->SetPicOverlayExcludeRect(true, a.x1, a.y1, (a.x2 - a.x1 + 1), (a.y2 - a.y1 + 1));
            } else {
                host->SetPicOverlayExcludeRect(false, 0, 0, 0, 0);
            }
        } else {
            host->SetPicOverlayExcludeRect(false, 0, 0, 0, 0);
        }
    }

    for (const auto& it : sorted) {
        if (it.kind != OverlayKind::Lvgl) {
            continue;
        }
        if (it.visible && it.root != nullptr) {
            lv_obj_move_foreground(it.root);
        }
    }
}

