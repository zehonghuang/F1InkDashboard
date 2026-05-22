#ifndef OVERLAY_Z_H
#define OVERLAY_Z_H

#include <cstddef>
#include <cstdint>

#include <lvgl.h>

class Display;

enum class OverlayKind : uint8_t { Lvgl = 0, Pic = 1 };

struct OverlayItem {
    OverlayKind kind = OverlayKind::Lvgl;
    lv_obj_t* root = nullptr;
    lv_obj_t* blocker = nullptr;
    int level = 0;
    bool visible = false;
    bool fullscreen = false;
};

void UpdateOverlayZ(Display* host, const OverlayItem* items, size_t count, int pic_level);

#endif  // OVERLAY_Z_H
