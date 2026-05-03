#include "pages/f1_page_adapter.h"

#include "lcd_display.h"
#include "lvgl_theme.h"
#include "settings.h"
#include "pages/f1_page_adapter_common.h"
#include "pages/f1_page_adapter_net.h"
#include "pages/f1_page_adapter_payloads.h"

#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <array>
#include <cstring>
#include <algorithm>
#include <memory>
#include <string_view>
#include <vector>

#include <font_zectrix.h>

#include "cJSON.h"
#include "esp_http_client.h"
#include "esp_log.h"
#include "esp_system.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "pngle.h"

extern "C" bool ZectrixReadBatteryPercentForFactoryTest(int* level);
#include "boards/zectrix-s3-epaper-4.2/rtc_pcf8563.h"
extern "C" RtcPcf8563* ZectrixGetRtc();
extern "C" bool ZectrixReadBatteryStatusForUi(int* level, int* voltage_mv);
#include "boards/zectrix-s3-epaper-4.2/charge_status.h"
extern "C" ChargeStatus::Snapshot ZectrixGetChargeSnapshot();

using namespace f1_page_internal;

namespace {

static int ClampBatteryPct(int v) {
    if (v < 0) return 0;
    if (v > 100) return 100;
    return v;
}

static const char* SelectBatteryIcon(int pct, const ChargeStatus::Snapshot& cs) {
    if (cs.no_battery) {
        return FONT_ZECTRIX_BATTERY_EMPTY;
    }
    if (cs.full) {
        return FONT_ZECTRIX_BATTERY_FULL;
    }
    if (cs.power_present && cs.charging) {
        return FONT_ZECTRIX_BATTERY_CHARGING;
    }
    if (pct >= 90) {
        return FONT_ZECTRIX_BATTERY_FULL;
    }
    if (pct >= 65) {
        return FONT_ZECTRIX_BATTERY_75;
    }
    if (pct >= 40) {
        return FONT_ZECTRIX_BATTERY_50;
    }
    if (pct >= 15) {
        return FONT_ZECTRIX_BATTERY_25;
    }
    return FONT_ZECTRIX_BATTERY_EMPTY;
}

static void SetBatteryWidgets(lv_obj_t* icon, lv_obj_t* pct_label, bool ok_pct, int pct, const ChargeStatus::Snapshot& cs) {
    if (icon != nullptr) {
        lv_label_set_text(icon, SelectBatteryIcon(pct, cs));
    }
    if (pct_label != nullptr) {
        if (!ok_pct || cs.no_battery) {
            lv_label_set_text(pct_label, "--%");
        } else {
            char buf[8];
            snprintf(buf, sizeof(buf), "%d%%", pct);
            lv_label_set_text(pct_label, buf);
        }
    }
}

struct PngleDrawCtx {
    uint16_t* dst = nullptr;
    uint32_t dst_w = 0;
    uint32_t dst_h = 0;
    uint32_t stride_px = 0;

    uint32_t src_w = 0;
    uint32_t src_h = 0;

    int32_t off_x = 0;
    int32_t off_y = 0;
    uint32_t draw_w = 0;
    uint32_t draw_h = 0;

    enum class Mode : uint8_t {
        Mean = 0,
        BBox = 1,
        Draw = 2,
    };
    Mode mode = Mode::Draw;
    bool lock_offset = false;

    bool has_bb = false;
    int32_t bb_min_x = 0;
    int32_t bb_min_y = 0;
    int32_t bb_max_x = 0;
    int32_t bb_max_y = 0;

    uint64_t sum_luma = 0;
    uint32_t cnt_luma = 0;
    bool invert = false;
};

[[maybe_unused]] static inline uint8_t Luma8(uint8_t r, uint8_t g, uint8_t b) {
    return static_cast<uint8_t>((static_cast<uint32_t>(r) * 30U + static_cast<uint32_t>(g) * 59U +
                                 static_cast<uint32_t>(b) * 11U) /
                                100U);
}

[[maybe_unused]] static void PngleOnInit(pngle_t* pngle, uint32_t w, uint32_t h) {
    auto* ctx = static_cast<PngleDrawCtx*>(pngle_get_user_data(pngle));
    if (ctx == nullptr) {
        return;
    }
    ctx->src_w = w;
    ctx->src_h = h;

    uint32_t draw_w = ctx->dst_w;
    uint32_t draw_h = ctx->dst_h;
    if (w != 0 && h != 0) {
        if (static_cast<int64_t>(w) * static_cast<int64_t>(ctx->dst_h) >
            static_cast<int64_t>(h) * static_cast<int64_t>(ctx->dst_w)) {
            draw_w = ctx->dst_w;
            draw_h = static_cast<uint32_t>((static_cast<int64_t>(ctx->dst_w) * static_cast<int64_t>(h)) /
                                           static_cast<int64_t>(w));
        } else {
            draw_h = ctx->dst_h;
            draw_w = static_cast<uint32_t>((static_cast<int64_t>(ctx->dst_h) * static_cast<int64_t>(w)) /
                                           static_cast<int64_t>(h));
        }
    }
    if (draw_w == 0) draw_w = 1;
    if (draw_h == 0) draw_h = 1;
    ctx->draw_w = draw_w;
    ctx->draw_h = draw_h;
    if (!ctx->lock_offset) {
        ctx->off_x = static_cast<int32_t>(ctx->dst_w - draw_w) / 2;
        ctx->off_y = static_cast<int32_t>(ctx->dst_h - draw_h) / 2;
    }
}

[[maybe_unused]] static void PngleOnDraw(pngle_t* pngle, uint32_t x, uint32_t y, uint32_t w, uint32_t h, const uint8_t rgba[4]) {
    auto* ctx = static_cast<PngleDrawCtx*>(pngle_get_user_data(pngle));
    if (ctx == nullptr || ctx->dst == nullptr || ctx->src_w == 0 || ctx->src_h == 0 || ctx->draw_w == 0 ||
        ctx->draw_h == 0) {
        return;
    }
    if (rgba[3] < 16) {
        return;
    }
    const uint8_t l_raw = Luma8(rgba[0], rgba[1], rgba[2]);
    if (ctx->mode == PngleDrawCtx::Mode::Mean) {
        ctx->sum_luma += l_raw;
        ctx->cnt_luma++;
        return;
    }
    uint8_t l = ctx->invert ? static_cast<uint8_t>(255U - l_raw) : l_raw;
    const bool black = l < 128;
    if (!black) {
        return;
    }

    int32_t dx0 = ctx->off_x +
                  static_cast<int32_t>((static_cast<int64_t>(x) * static_cast<int64_t>(ctx->draw_w)) /
                                       static_cast<int64_t>(ctx->src_w));
    int32_t dx1 = ctx->off_x +
                  static_cast<int32_t>((static_cast<int64_t>(x + w) * static_cast<int64_t>(ctx->draw_w)) /
                                       static_cast<int64_t>(ctx->src_w));
    int32_t dy0 = ctx->off_y +
                  static_cast<int32_t>((static_cast<int64_t>(y) * static_cast<int64_t>(ctx->draw_h)) /
                                       static_cast<int64_t>(ctx->src_h));
    int32_t dy1 = ctx->off_y +
                  static_cast<int32_t>((static_cast<int64_t>(y + h) * static_cast<int64_t>(ctx->draw_h)) /
                                       static_cast<int64_t>(ctx->src_h));

    if (dx1 <= dx0) dx1 = dx0 + 1;
    if (dy1 <= dy0) dy1 = dy0 + 1;

    if (dx0 < 0) dx0 = 0;
    if (dy0 < 0) dy0 = 0;
    if (dx1 > static_cast<int32_t>(ctx->dst_w)) dx1 = static_cast<int32_t>(ctx->dst_w);
    if (dy1 > static_cast<int32_t>(ctx->dst_h)) dy1 = static_cast<int32_t>(ctx->dst_h);

    if (ctx->mode == PngleDrawCtx::Mode::BBox) {
        const int32_t mx0 = dx0;
        const int32_t my0 = dy0;
        const int32_t mx1 = dx1 - 1;
        const int32_t my1 = dy1 - 1;
        if (mx1 < mx0 || my1 < my0) {
            return;
        }
        if (!ctx->has_bb) {
            ctx->has_bb = true;
            ctx->bb_min_x = mx0;
            ctx->bb_min_y = my0;
            ctx->bb_max_x = mx1;
            ctx->bb_max_y = my1;
        } else {
            if (mx0 < ctx->bb_min_x) ctx->bb_min_x = mx0;
            if (my0 < ctx->bb_min_y) ctx->bb_min_y = my0;
            if (mx1 > ctx->bb_max_x) ctx->bb_max_x = mx1;
            if (my1 > ctx->bb_max_y) ctx->bb_max_y = my1;
        }
        return;
    }

    for (int32_t yy = dy0; yy < dy1; yy++) {
        uint16_t* row = ctx->dst + static_cast<uint32_t>(yy) * ctx->stride_px;
        for (int32_t xx = dx0; xx < dx1; xx++) {
            row[static_cast<uint32_t>(xx)] = 0x0000;
        }
    }
}

[[maybe_unused]] static bool PngleFeedAll(pngle_t* pngle, const uint8_t* data, size_t size) {
    size_t off = 0;
    while (off < size) {
        const int n = pngle_feed(pngle, data + off, size - off);
        if (n < 0) {
            return false;
        }
        if (n == 0) {
            return false;
        }
        off += static_cast<size_t>(n);
    }
    const char* err = pngle_error(pngle);
    if (err != nullptr && strcmp(err, "No error") != 0) {
        return false;
    }
    return true;
}

[[maybe_unused]] static bool DecodePngToRgb565ContainPngle(const std::vector<uint8_t>& png_bytes,
                                         lv_coord_t dst_w,
                                         lv_coord_t dst_h,
                                         std::vector<uint16_t>& out_pixels,
                                         lv_image_dsc_t& out_dsc,
                                         uint32_t& out_src_w,
                                         uint32_t& out_src_h) {
    out_src_w = 0;
    out_src_h = 0;
    if (dst_w <= 0 || dst_h <= 0) {
        return false;
    }
    if (png_bytes.size() < 8 || memcmp(png_bytes.data(), "\x89PNG\r\n\x1a\n", 8) != 0) {
        return false;
    }

    const uint32_t stride = lv_draw_buf_width_to_stride(dst_w, LV_COLOR_FORMAT_RGB565);
    const uint32_t stride_px = stride / 2U;
    const size_t need_px = static_cast<size_t>(stride_px) * static_cast<size_t>(dst_h);
    if (out_pixels.size() != need_px) {
        out_pixels.assign(need_px, 0xFFFF);
    } else {
        std::fill(out_pixels.begin(), out_pixels.end(), 0xFFFF);
    }

    PngleDrawCtx ctx;
    ctx.dst = out_pixels.data();
    ctx.dst_w = static_cast<uint32_t>(dst_w);
    ctx.dst_h = static_cast<uint32_t>(dst_h);
    ctx.stride_px = stride_px;

    {
        pngle_t* p = pngle_new();
        if (p == nullptr) {
            return false;
        }
        ctx.mode = PngleDrawCtx::Mode::Mean;
        ctx.lock_offset = false;
        ctx.sum_luma = 0;
        ctx.cnt_luma = 0;
        pngle_set_user_data(p, &ctx);
        pngle_set_init_callback(p, &PngleOnInit);
        pngle_set_draw_callback(p, &PngleOnDraw);
        const bool ok = PngleFeedAll(p, png_bytes.data(), png_bytes.size());
        const char* err = pngle_error(p);
        pngle_destroy(p);
        if (!ok) {
            if (err != nullptr) {
                ESP_LOGW(kTag, "pngle probe failed err=%s", err);
            }
            return false;
        }
        if (ctx.cnt_luma > 0) {
            const uint32_t mean = static_cast<uint32_t>(ctx.sum_luma / ctx.cnt_luma);
            ctx.invert = mean < 128;
        } else {
            ctx.invert = false;
        }
    }

    int32_t dx_bias = 0;
    int32_t dy_bias = 0;
    {
        pngle_t* p = pngle_new();
        if (p == nullptr) {
            return false;
        }
        ctx.mode = PngleDrawCtx::Mode::BBox;
        ctx.lock_offset = false;
        ctx.has_bb = false;
        ctx.bb_min_x = 0;
        ctx.bb_min_y = 0;
        ctx.bb_max_x = 0;
        ctx.bb_max_y = 0;
        pngle_set_user_data(p, &ctx);
        pngle_set_init_callback(p, &PngleOnInit);
        pngle_set_draw_callback(p, &PngleOnDraw);
        const bool ok = PngleFeedAll(p, png_bytes.data(), png_bytes.size());
        const char* err = pngle_error(p);
        pngle_destroy(p);
        if (!ok) {
            if (err != nullptr) {
                ESP_LOGW(kTag, "pngle bbox failed err=%s", err);
            }
            return false;
        }
        if (ctx.has_bb) {
            const int32_t dst_max_x = static_cast<int32_t>(ctx.dst_w) - 1;
            const int32_t dst_max_y = static_cast<int32_t>(ctx.dst_h) - 1;
            const int32_t bb_cx = (ctx.bb_min_x + ctx.bb_max_x) / 2;
            const int32_t bb_cy = (ctx.bb_min_y + ctx.bb_max_y) / 2;
            const int32_t want_cx = dst_max_x / 2;
            const int32_t want_cy = dst_max_y / 2;
            dx_bias = want_cx - bb_cx;
            dy_bias = want_cy - bb_cy;

            if (ctx.bb_min_x + dx_bias < 0) {
                dx_bias -= (ctx.bb_min_x + dx_bias);
            }
            if (ctx.bb_max_x + dx_bias > dst_max_x) {
                dx_bias -= (ctx.bb_max_x + dx_bias - dst_max_x);
            }

            if (ctx.bb_min_y + dy_bias < 0) {
                dy_bias -= (ctx.bb_min_y + dy_bias);
            }
            if (ctx.bb_max_y + dy_bias > dst_max_y) {
                dy_bias -= (ctx.bb_max_y + dy_bias - dst_max_y);
            }
        }
    }

    {
        pngle_t* p = pngle_new();
        if (p == nullptr) {
            return false;
        }
        std::fill(out_pixels.begin(), out_pixels.end(), 0xFFFF);
        ctx.mode = PngleDrawCtx::Mode::Draw;
        ctx.lock_offset = true;
        ctx.off_x += dx_bias;
        ctx.off_y += dy_bias;
        pngle_set_user_data(p, &ctx);
        pngle_set_init_callback(p, &PngleOnInit);
        pngle_set_draw_callback(p, &PngleOnDraw);
        const bool ok = PngleFeedAll(p, png_bytes.data(), png_bytes.size());
        const char* err = pngle_error(p);
        pngle_destroy(p);
        if (!ok) {
            if (err != nullptr) {
                ESP_LOGW(kTag, "pngle decode failed err=%s", err);
            }
            return false;
        }
    }

    out_src_w = ctx.src_w;
    out_src_h = ctx.src_h;
    if (out_src_w == 0 || out_src_h == 0) {
        return false;
    }

    out_dsc.header.magic = LV_IMAGE_HEADER_MAGIC;
    out_dsc.header.cf = LV_COLOR_FORMAT_RGB565;
    out_dsc.header.w = static_cast<int32_t>(dst_w);
    out_dsc.header.h = static_cast<int32_t>(dst_h);
    out_dsc.header.stride = stride;
    out_dsc.data_size = static_cast<uint32_t>(stride) * static_cast<uint32_t>(dst_h);
    out_dsc.data = reinterpret_cast<const uint8_t*>(out_pixels.data());
    return true;
}

}  // namespace

void F1PageAdapter::ApplyCircuitImageLocked() {
    if (race_track_box_ == nullptr) {
        return;
    }
    constexpr int kInset = 2;
    if (menu_visible_) {
        if (host_ != nullptr && circuit_image_pic_active_) {
            lv_area_t a{};
            lv_obj_get_coords(race_track_box_, &a);
            const int x = a.x1 + kInset;
            const int y = a.y1 + kInset;
            const int w = (a.x2 - a.x1 + 1) - kInset * 2;
            const int h = (a.y2 - a.y1 + 1) - kInset * 2;
            if (w > 0 && h > 0) {
                host_->UpdatePicRegion(x, y, w, h, nullptr, 0);
            }
        }
        circuit_image_pic_active_ = false;
        lv_obj_invalidate(race_track_box_);
        return;
    }
    if (view_index_ != 0) {
        if (host_ != nullptr && circuit_image_pic_active_) {
            lv_area_t a{};
            lv_obj_get_coords(race_track_box_, &a);
            const int x = a.x1 + kInset;
            const int y = a.y1 + kInset;
            const int w = (a.x2 - a.x1 + 1) - kInset * 2;
            const int h = (a.y2 - a.y1 + 1) - kInset * 2;
            if (w > 0 && h > 0) {
                host_->UpdatePicRegion(x, y, w, h, nullptr, 0);
            }
        }
        circuit_image_pic_active_ = false;
        lv_obj_invalidate(race_track_box_);
        return;
    }
    lv_area_t a{};
    lv_obj_get_coords(race_track_box_, &a);
    const int x = a.x1 + kInset;
    const int y = a.y1 + kInset;
    const int w = (a.x2 - a.x1 + 1) - kInset * 2;
    const int h = (a.y2 - a.y1 + 1) - kInset * 2;
    if (w <= 0 || h <= 0) {
        return;
    }

    const size_t expected = static_cast<size_t>((w + 7) >> 3) * static_cast<size_t>(h);
    if (circuit_image_bytes_.empty()) {
        if (host_ != nullptr) {
            host_->UpdatePicRegion(x, y, w, h, nullptr, 0);
        }
        circuit_image_pic_active_ = false;
        if (race_track_placeholder_ != nullptr) {
            lv_obj_clear_flag(race_track_placeholder_, LV_OBJ_FLAG_HIDDEN);
        }
        lv_obj_invalidate(race_track_box_);
        return;
    }
    if (circuit_image_bytes_.size() != expected) {
        ESP_LOGW(kTag, "circuit frame size mismatch got=%u exp=%u url=%s",
                 static_cast<unsigned>(circuit_image_bytes_.size()),
                 static_cast<unsigned>(expected),
                 circuit_image_url_.c_str());
        if (host_ != nullptr) {
            host_->UpdatePicRegion(x, y, w, h, nullptr, 0);
            host_->RequestUrgentFullRefresh();
        }
        circuit_image_pic_active_ = false;
        if (race_track_placeholder_ != nullptr) {
            lv_label_set_text(race_track_placeholder_, "地图加载失败");
            lv_obj_clear_flag(race_track_placeholder_, LV_OBJ_FLAG_HIDDEN);
        }
        lv_obj_invalidate(race_track_box_);
        return;
    }

    if (host_ != nullptr) {
        host_->UpdatePicRegion(x, y, w, h, circuit_image_bytes_.data(), circuit_image_bytes_.size());
        host_->RequestDebouncedRefresh(150);
    }
    circuit_image_pic_active_ = true;
    if (race_track_image_ != nullptr) {
        lv_obj_add_flag(race_track_image_, LV_OBJ_FLAG_HIDDEN);
    }
    if (race_track_placeholder_ != nullptr) {
        lv_obj_add_flag(race_track_placeholder_, LV_OBJ_FLAG_HIDDEN);
    }
    lv_obj_invalidate(race_track_box_);
}

void F1PageAdapter::ApplyCircuitDetailImageLocked() {
    if (circuit_map_root_ == nullptr) {
        return;
    }
    constexpr int kInset = 2;
    if (menu_visible_) {
        if (host_ != nullptr && circuit_detail_pic_active_) {
            lv_area_t a{};
            lv_obj_get_coords(circuit_map_root_, &a);
            const int x = a.x1 + 4 + kInset;
            const int y = a.y1 + 4 + kInset;
            const int w = ((a.x2 - a.x1 + 1) - 8) - kInset * 2;
            const int h = ((a.y2 - a.y1 + 1) - 8) - kInset * 2;
            if (w > 0 && h > 0) {
                host_->UpdatePicRegion(x, y, w, h, nullptr, 0);
            }
        }
        circuit_detail_pic_active_ = false;
        lv_obj_invalidate(circuit_map_root_);
        return;
    }
    if (view_index_ != 4 || circuit_page_ != 0) {
        if (host_ != nullptr && circuit_detail_pic_active_) {
            lv_area_t a{};
            lv_obj_get_coords(circuit_map_root_, &a);
            const int x = a.x1 + 4 + kInset;
            const int y = a.y1 + 4 + kInset;
            const int w = ((a.x2 - a.x1 + 1) - 8) - kInset * 2;
            const int h = ((a.y2 - a.y1 + 1) - 8) - kInset * 2;
            if (w > 0 && h > 0) {
                host_->UpdatePicRegion(x, y, w, h, nullptr, 0);
            }
        }
        circuit_detail_pic_active_ = false;
        lv_obj_invalidate(circuit_map_root_);
        return;
    }
    lv_area_t a{};
    lv_obj_get_coords(circuit_map_root_, &a);
    int x = a.x1 + 4 + kInset;
    int y = a.y1 + 4 + kInset;
    int w = ((a.x2 - a.x1 + 1) - 8) - kInset * 2;
    int h = ((a.y2 - a.y1 + 1) - 8) - kInset * 2;
    if (w <= 0 || h <= 0) {
        return;
    }

    const size_t expected = static_cast<size_t>((w + 7) >> 3) * static_cast<size_t>(h);
    if (circuit_detail_image_bytes_.empty()) {
        if (host_ != nullptr) {
            host_->UpdatePicRegion(x, y, w, h, nullptr, 0);
        }
        circuit_detail_pic_active_ = false;
        if (circuit_map_placeholder_ != nullptr) {
            lv_obj_clear_flag(circuit_map_placeholder_, LV_OBJ_FLAG_HIDDEN);
        }
        lv_obj_invalidate(circuit_map_root_);
        return;
    }
    if (circuit_detail_image_bytes_.size() != expected) {
        ESP_LOGW(kTag, "circuit detail frame size mismatch got=%u exp=%u url=%s",
                 static_cast<unsigned>(circuit_detail_image_bytes_.size()),
                 static_cast<unsigned>(expected),
                 circuit_detail_image_url_.c_str());
        if (host_ != nullptr) {
            host_->UpdatePicRegion(x, y, w, h, nullptr, 0);
            host_->RequestUrgentFullRefresh();
        }
        circuit_detail_pic_active_ = false;
        if (circuit_map_placeholder_ != nullptr) {
            lv_label_set_text(circuit_map_placeholder_, "地图加载失败");
            lv_obj_clear_flag(circuit_map_placeholder_, LV_OBJ_FLAG_HIDDEN);
        }
        lv_obj_invalidate(circuit_map_root_);
        return;
    }

    if (host_ != nullptr) {
        host_->UpdatePicRegion(x, y, w, h, circuit_detail_image_bytes_.data(), circuit_detail_image_bytes_.size());
        host_->RequestDebouncedRefresh(150);
    }
    circuit_detail_pic_active_ = true;
    if (circuit_map_image_ != nullptr) {
        lv_obj_add_flag(circuit_map_image_, LV_OBJ_FLAG_HIDDEN);
    }
    if (circuit_map_placeholder_ != nullptr) {
        lv_obj_add_flag(circuit_map_placeholder_, LV_OBJ_FLAG_HIDDEN);
    }
    lv_obj_invalidate(circuit_map_root_);
}

F1PageAdapter::F1PageAdapter(LcdDisplay* host)
    : host_(host), nav_(this, NavNode::RaceRoot, NavNode::OffRoot) {
    nav_children_race_.fill(-1);
    nav_children_off_.fill(-1);
    nav_children_race_[1] = static_cast<int8_t>(NavNode::Circuit);
    nav_children_race_[2] = static_cast<int8_t>(NavNode::RaceSessions);
    nav_children_off_[0] = static_cast<int8_t>(NavNode::Wdc);
    nav_children_off_[1] = static_cast<int8_t>(NavNode::Circuit);
    nav_children_off_[2] = static_cast<int8_t>(NavNode::Wcc);
}

F1PageAdapter::~F1PageAdapter() {
    if (refresh_timer_ != nullptr) {
        esp_timer_stop(refresh_timer_);
        esp_timer_delete(refresh_timer_);
        refresh_timer_ = nullptr;
    }
    if (race_right_canvas_buf_ != nullptr) {
        lv_free(race_right_canvas_buf_);
        race_right_canvas_buf_ = nullptr;
    }
}

UiPageId F1PageAdapter::Id() const {
    return UiPageId::F1;
}

const char* F1PageAdapter::Name() const {
    return "F1";
}

void F1PageAdapter::Build() {
    if (built_ || host_ == nullptr) {
        built_ = true;
        return;
    }
    auto* lvgl_theme = static_cast<LvglTheme*>(host_->current_theme_);
    const lv_font_t* text_font = lvgl_theme && lvgl_theme->text_font() ? lvgl_theme->text_font()->font()
                                                                       : nullptr;
    const lv_font_t* small_font = &lv_font_montserrat_14;

    if (refresh_timer_ == nullptr) {
        esp_timer_create_args_t t = {};
        t.callback = &F1PageAdapter::RefreshTimerCallback;
        t.arg = this;
        t.dispatch_method = ESP_TIMER_TASK;
        t.name = "f1_refresh";
        (void)esp_timer_create(&t, &refresh_timer_);
    }

    if (host_->f1_screen_ != nullptr) {
        screen_ = host_->f1_screen_;
        built_ = true;
        return;
    }

    screen_ = lv_obj_create(nullptr);
    host_->f1_screen_ = screen_;
    StyleScreen(screen_);

    race_root_ = lv_obj_create(screen_);
    lv_obj_set_size(race_root_, kPageWidth, kPageHeight);
    lv_obj_align(race_root_, LV_ALIGN_TOP_LEFT, 0, 0);
    lv_obj_set_style_bg_opa(race_root_, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(race_root_, 0, 0);
    lv_obj_set_style_pad_all(race_root_, 0, 0);
    BuildRaceLocked();

    standings_root_ = lv_obj_create(screen_);
    lv_obj_set_size(standings_root_, kPageWidth, kPageHeight);
    lv_obj_align(standings_root_, LV_ALIGN_TOP_LEFT, 0, 0);
    lv_obj_set_style_bg_opa(standings_root_, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(standings_root_, 0, 0);
    lv_obj_set_style_pad_all(standings_root_, 0, 0);
    BuildStandingsLocked();

    wdc_root_ = lv_obj_create(screen_);
    lv_obj_set_size(wdc_root_, kPageWidth, kPageHeight);
    lv_obj_align(wdc_root_, LV_ALIGN_TOP_LEFT, 0, 0);
    lv_obj_set_style_bg_opa(wdc_root_, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(wdc_root_, 0, 0);
    lv_obj_set_style_pad_all(wdc_root_, 0, 0);
    BuildWdcDetailLocked();

    wcc_root_ = lv_obj_create(screen_);
    lv_obj_set_size(wcc_root_, kPageWidth, kPageHeight);
    lv_obj_align(wcc_root_, LV_ALIGN_TOP_LEFT, 0, 0);
    lv_obj_set_style_bg_opa(wcc_root_, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(wcc_root_, 0, 0);
    lv_obj_set_style_pad_all(wcc_root_, 0, 0);
    BuildWccDetailLocked();

    circuit_root_ = lv_obj_create(screen_);
    lv_obj_set_size(circuit_root_, kPageWidth, kPageHeight);
    lv_obj_align(circuit_root_, LV_ALIGN_TOP_LEFT, 0, 0);
    lv_obj_set_style_bg_opa(circuit_root_, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(circuit_root_, 0, 0);
    lv_obj_set_style_pad_all(circuit_root_, 0, 0);
    BuildCircuitDetailLocked();

    race_sessions_root_ = lv_obj_create(screen_);
    lv_obj_set_size(race_sessions_root_, kPageWidth, kPageHeight);
    lv_obj_align(race_sessions_root_, LV_ALIGN_TOP_LEFT, 0, 0);
    lv_obj_set_style_bg_opa(race_sessions_root_, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(race_sessions_root_, 0, 0);
    lv_obj_set_style_pad_all(race_sessions_root_, 0, 0);
    BuildRaceSessionsLocked();

    menu_root_ = lv_obj_create(screen_);
    lv_obj_set_size(menu_root_, kPageWidth, kPageHeight);
    lv_obj_align(menu_root_, LV_ALIGN_TOP_LEFT, 0, 0);
    lv_obj_set_style_border_width(menu_root_, 0, 0);
    lv_obj_set_style_pad_all(menu_root_, 0, 0);
    BuildMenuLocked();
    UpdateMenuStatusLocked();
    SetRootVisible(menu_root_, false);

    (void)text_font;
    (void)small_font;

    host_->RegisterStatusBarWidgetsInLock({status_time_, status_date_, status_batt_icon_, status_batt_pct_});
    host_->RegisterStatusBarWidgetsInLock({nullptr, nullptr, race_sessions_header_batt_icon_, race_sessions_header_batt_pct_});
    host_->RegisterStatusBarWidgetsInLock({nullptr, nullptr, live_header_batt_icon_, live_header_batt_pct_});
    host_->RegisterStatusBarWidgetsInLock({nullptr, nullptr, menu_header_batt_icon_, menu_header_batt_pct_});
    host_->UpdateStatusBarInLock(true);

    built_ = true;
    ApplyViewLocked();
}

lv_obj_t* F1PageAdapter::Screen() const {
    return screen_;
}

void F1PageAdapter::OnShow() {
    active_ = true;
    ApplyViewLocked();
    UpdateBatteryUiLocked();
    StartFetchIfNeededLocked(false);
    RestartRefreshTimerLocked();
}

void F1PageAdapter::OnHide() {
    active_ = false;
    if (refresh_timer_ != nullptr) {
        (void)esp_timer_stop(refresh_timer_);
    }
}

bool F1PageAdapter::HandleEvent(const UiPageEvent& event) {
    if (event.type != UiPageEventType::Custom) {
        return false;
    }
    const auto id = static_cast<UiPageCustomEventId>(event.i32);
    if (id == UiPageCustomEventId::ComboUpDown) {
        menu_visible_ = !menu_visible_;
        SetRootVisible(menu_root_, menu_visible_);
        if (menu_visible_) {
            UpdateMenuStatusLocked();
            ApplyMenuSelectionLocked();
        }
        ApplyCircuitImageLocked();
        ApplyCircuitDetailImageLocked();
        if (host_ != nullptr) {
            host_->RequestUrgentFullRefresh();
        }
        return true;
    }
    if (menu_visible_) {
        if (id == UiPageCustomEventId::PagePrev || id == UiPageCustomEventId::GalleryPrev) {
            menu_focus_--;
            if (menu_focus_ < 0) {
                menu_focus_ = static_cast<int>(menu_item_boxes_.size()) - 1;
            }
            UpdateMenuStatusLocked();
            ApplyMenuSelectionLocked();
            if (host_ != nullptr) {
                host_->RequestDebouncedRefresh(150);
            }
            return true;
        }
        if (id == UiPageCustomEventId::PageNext || id == UiPageCustomEventId::GalleryNext) {
            menu_focus_++;
            if (menu_focus_ >= static_cast<int>(menu_item_boxes_.size())) {
                menu_focus_ = 0;
            }
            UpdateMenuStatusLocked();
            ApplyMenuSelectionLocked();
            if (host_ != nullptr) {
                host_->RequestDebouncedRefresh(150);
            }
            return true;
        }
        if (id == UiPageCustomEventId::ConfirmLongPress) {
            menu_visible_ = false;
            SetRootVisible(menu_root_, false);
            ApplyCircuitImageLocked();
            ApplyCircuitDetailImageLocked();
            if (host_ != nullptr) {
                host_->RequestUrgentFullRefresh();
            }
            return true;
        }
        if (id == UiPageCustomEventId::ConfirmClick) {
            if (menu_focus_ == 6) {
                esp_restart();
            }
            if (menu_focus_ == 2) {
                pending_sessions_force_fetch_ = true;
                StartFetchIfNeededLocked(true);
            }
            menu_visible_ = false;
            SetRootVisible(menu_root_, false);
            if (host_ != nullptr) {
                host_->RequestUrgentFullRefresh();
            }
            return true;
        }
        return true;
    }
    if (id == UiPageCustomEventId::F1OpenF1WsEvent) {
        std::unique_ptr<std::string> payload(static_cast<std::string*>(event.ptr));
        if (payload && !payload->empty()) {
            (void)ApplyOpenF1WsJsonLocked(payload->c_str(), payload->size());
            ApplyLiveFromStateLocked();
            if (host_ != nullptr) {
                host_->RequestDebouncedRefresh(150);
            }
        }
        return true;
    }
    if (id == UiPageCustomEventId::PagePrevDoubleClick) {
        if (!nav_.IsAtRoot() && nav_.Current() == NavNode::RaceSessions) {
            const int cur = race_sessions_page_;
            const int next = (cur + 3) % 4;
            race_sessions_page_ = next;
            ApplyRaceSessionsLocked();
            StartSessionsFetchIfNeededLocked(true);
            if (host_ != nullptr) {
                host_->RequestUrgentFullRefresh();
            }
            return true;
        }
    }
    if (id == UiPageCustomEventId::PageNextDoubleClick) {
        if (!nav_.IsAtRoot() && nav_.Current() == NavNode::RaceSessions) {
            const int cur = race_sessions_page_;
            const int next = (cur + 1) % 4;
            race_sessions_page_ = next;
            ApplyRaceSessionsLocked();
            StartSessionsFetchIfNeededLocked(true);
            if (host_ != nullptr) {
                host_->RequestUrgentFullRefresh();
            }
            return true;
        }
    }
    if (id == UiPageCustomEventId::PagePrev || id == UiPageCustomEventId::GalleryPrev) {
        if (!nav_.IsAtRoot() && nav_.Current() == NavNode::RaceSessions) {
            const auto p = static_cast<RaceSessionsSubPage>(static_cast<uint8_t>(race_sessions_page_));
            if (p == RaceSessionsSubPage::QualiResult) {
                if (quali_result_page_count_ > 1) {
                    quali_result_page_ = (quali_result_page_ + (quali_result_page_count_ - 1)) % quali_result_page_count_;
                    ApplyQualiResultPageLocked();
                }
            } else if (p == RaceSessionsSubPage::RaceResult) {
                if (race_result_page_count_ > 1) {
                    race_result_page_ = (race_result_page_ + (race_result_page_count_ - 1)) % race_result_page_count_;
                    ApplyRaceResultPageLocked();
                }
            }
            ApplyRaceSessionsLocked();
            if (host_ != nullptr) {
                host_->RequestDebouncedRefresh(150);
            }
            return true;
        }
        nav_.Prev();
        if (host_ != nullptr) {
            host_->RequestDebouncedRefresh(150);
        }
        return true;
    }
    if (id == UiPageCustomEventId::PageNext || id == UiPageCustomEventId::GalleryNext) {
        if (!nav_.IsAtRoot() && nav_.Current() == NavNode::RaceSessions) {
            const auto p = static_cast<RaceSessionsSubPage>(static_cast<uint8_t>(race_sessions_page_));
            if (p == RaceSessionsSubPage::QualiResult) {
                if (quali_result_page_count_ > 1) {
                    quali_result_page_ = (quali_result_page_ + 1) % quali_result_page_count_;
                    ApplyQualiResultPageLocked();
                }
            } else if (p == RaceSessionsSubPage::RaceResult) {
                if (race_result_page_count_ > 1) {
                    race_result_page_ = (race_result_page_ + 1) % race_result_page_count_;
                    ApplyRaceResultPageLocked();
                }
            }
            ApplyRaceSessionsLocked();
            if (host_ != nullptr) {
                host_->RequestDebouncedRefresh(150);
            }
            return true;
        }
        nav_.Next();
        if (host_ != nullptr) {
            host_->RequestDebouncedRefresh(150);
        }
        return true;
    }
    if (id == UiPageCustomEventId::JumpRaceDay) {
        if (nav_.IsAtRoot()) {
            nav_.ToggleRoot();
            if (host_ != nullptr) {
                host_->RequestUrgentFullRefresh();
            }
        }
        return true;
    }
    if (id == UiPageCustomEventId::JumpOffWeek) {
        return true;
    }
    if (id == UiPageCustomEventId::F1ForceSessionsFetch) {
        pending_sessions_force_fetch_ = true;
        StartFetchIfNeededLocked(true);
        return true;
    }
    if (id == UiPageCustomEventId::ConfirmClick) {
        nav_.Enter();
        if (host_ != nullptr) {
            host_->RequestUrgentFullRefresh();
        }
        return true;
    }
    if (id == UiPageCustomEventId::ConfirmLongPress) {
        nav_.Back();
        if (host_ != nullptr) {
            host_->RequestUrgentFullRefresh();
        }
        return true;
    }
    if (id == UiPageCustomEventId::F1Data) {
        std::unique_ptr<std::string> payload(static_cast<std::string*>(event.ptr));
        if (!active_) {
            return true;
        }
        if (payload) {
            (void)ApplyUiJsonLocked(payload->c_str(), payload->size());
        }
        MaybeAutoEnterRaceLiveLocked();
        if (pending_sessions_force_fetch_) {
            pending_sessions_force_fetch_ = false;
            StartSessionsFetchIfNeededLocked(true);
        }
        if (menu_visible_) {
            UpdateMenuStatusLocked();
        }
        if (host_ != nullptr) {
            host_->RequestUrgentFullRefresh();
        }
        return true;
    }
    if (id == UiPageCustomEventId::F1SessionsData) {
        std::unique_ptr<std::string> payload(static_cast<std::string*>(event.ptr));
        if (!active_) {
            return true;
        }
        if (payload) {
            (void)ApplySessionsJsonLocked(payload->c_str(), payload->size());
        }
        MaybeAutoEnterRaceLiveLocked();
        if (host_ != nullptr) {
            host_->RequestUrgentFullRefresh();
        }
        return true;
    }
    if (id == UiPageCustomEventId::F1CircuitImage) {
        std::unique_ptr<f1_page_internal::CircuitImagePayload> payload(
            static_cast<f1_page_internal::CircuitImagePayload*>(event.ptr));
        if (!payload) {
            return true;
        }
        if (payload->url != circuit_image_url_) {
            ESP_LOGI(kTag, "circuit image drop url=%s expected=%s status=%d bytes=%u final=%s",
                     payload->url.c_str(),
                     circuit_image_url_.c_str(),
                     payload->status,
                     static_cast<unsigned>(payload->bytes.size()),
                     payload->final_url.c_str());
            return true;
        }
        circuit_image_bytes_ = std::move(payload->bytes);
        if (active_) {
            ApplyCircuitImageLocked();
        }
        return true;
    }
    if (id == UiPageCustomEventId::F1CircuitDetailImage) {
        std::unique_ptr<f1_page_internal::CircuitDetailImagePayload> payload(
            static_cast<f1_page_internal::CircuitDetailImagePayload*>(event.ptr));
        if (!payload) {
            return true;
        }
        if (payload->url != circuit_detail_image_url_) {
            ESP_LOGI(kTag, "circuit detail image drop url=%s expected=%s status=%d bytes=%u final=%s",
                     payload->url.c_str(),
                     circuit_detail_image_url_.c_str(),
                     payload->status,
                     static_cast<unsigned>(payload->bytes.size()),
                     payload->final_url.c_str());
            return true;
        }
        circuit_detail_image_bytes_ = std::move(payload->bytes);
        if (active_) {
            ApplyCircuitDetailImageLocked();
        }
        return true;
    }
    if (id == UiPageCustomEventId::F1Tick) {
        if (!active_) {
            return true;
        }
        StartFetchIfNeededLocked(false);
        if (view_index_ == 5) {
            StartSessionsFetchIfNeededLocked(false);
        }
        MaybeAutoEnterRaceLiveLocked();
        UpdateBatteryUiLocked();
        if (menu_visible_) {
            UpdateMenuStatusLocked();
        }
        return true;
    }
    return false;
}

void F1PageAdapter::UpdateMenuStatusLocked() {
    if (!built_ || menu_header_time_ == nullptr) {
        return;
    }

    char time_buf[16] = {};
    bool has_time = false;
    {
        auto* rtc = ZectrixGetRtc();
        if (rtc != nullptr) {
            tm local_tm = {};
            if (rtc->GetTime(local_tm)) {
                snprintf(time_buf, sizeof(time_buf), "%02d:%02d", local_tm.tm_hour, local_tm.tm_min);
                has_time = true;
            }
        }
    }

    const char* t = has_time ? time_buf : (status_time_ ? lv_label_get_text(status_time_) : "--:--");
    SetText(menu_header_time_, t);
    UpdateBatteryUiLocked();
}

void F1PageAdapter::UpdateBatteryUiLocked() {
    if (!built_) {
        return;
    }

    if (host_ != nullptr) {
        host_->UpdateStatusBarInLock(false);
    }

    lv_obj_t* r = menu_item_right_[4];
    if (r != nullptr) {
        int pct = -1;
        int mv = 0;
        const bool ok_pct = ZectrixReadBatteryStatusForUi(&pct, &mv);
        pct = ClampBatteryPct(pct);
        const ChargeStatus::Snapshot cs = ZectrixGetChargeSnapshot();
        if (!ok_pct || cs.no_battery || mv <= 0) {
            SetText(r, "Now: --% / --.--V");
        } else {
            char buf[48];
            const int v_int = mv / 1000;
            const int v_frac = (mv % 1000) / 10;
            snprintf(buf, sizeof(buf), "Now: %d%% / %d.%02dV", pct, v_int, v_frac);
            SetText(r, buf);
        }
    }
}

void F1PageAdapter::ApplyViewLocked() {
    if (!built_) {
        return;
    }
    SetRootVisible(race_root_, view_index_ == 0);
    SetRootVisible(standings_root_, view_index_ == 1);
    SetRootVisible(wdc_root_, view_index_ == 2);
    SetRootVisible(wcc_root_, view_index_ == 3);
    SetRootVisible(circuit_root_, view_index_ == 4);
    SetRootVisible(race_sessions_root_, view_index_ == 5);
    SetRootVisible(menu_root_, menu_visible_);
    if (host_ != nullptr) {
        if (view_index_ != 0 && circuit_image_pic_active_ && race_track_box_ != nullptr) {
            lv_area_t a{};
            lv_obj_get_coords(race_track_box_, &a);
            constexpr int kInset = 2;
            const int x = a.x1 + kInset;
            const int y = a.y1 + kInset;
            const int w = (a.x2 - a.x1 + 1) - kInset * 2;
            const int h = (a.y2 - a.y1 + 1) - kInset * 2;
            if (w > 0 && h > 0) {
                host_->UpdatePicRegion(x, y, w, h, nullptr, 0);
            }
            circuit_image_pic_active_ = false;
            lv_obj_invalidate(race_track_box_);
        }
        if (!(view_index_ == 4 && circuit_page_ == 0) && circuit_detail_pic_active_ && circuit_map_root_ != nullptr) {
            lv_area_t a{};
            lv_obj_get_coords(circuit_map_root_, &a);
            constexpr int kInset = 2;
            const int x = a.x1 + 4 + kInset;
            const int y = a.y1 + 4 + kInset;
            const int w = ((a.x2 - a.x1 + 1) - 8) - kInset * 2;
            const int h = ((a.y2 - a.y1 + 1) - 8) - kInset * 2;
            if (w > 0 && h > 0) {
                host_->UpdatePicRegion(x, y, w, h, nullptr, 0);
            }
            circuit_detail_pic_active_ = false;
            lv_obj_invalidate(circuit_map_root_);
        }
    }
    if (view_index_ == 1) {
        UpdateOffWeekSelectionLocked();
    }
    if (view_index_ == 0) {
        UpdateRaceDaySelectionLocked();
        ApplyCircuitImageLocked();
    }
    if (view_index_ == 4 && circuit_page_ == 0) {
        ApplyCircuitDetailImageLocked();
    }
}

void F1PageAdapter::MaybeAutoEnterRaceLiveLocked() {
    if (!active_) {
        return;
    }
    if (race_live_start_ms_ <= 0) {
        return;
    }
    if (race_live_auto_entered_) {
        return;
    }
    const int64_t now = NowMs();
    if (now < race_live_start_ms_) {
        return;
    }
    race_live_auto_entered_ = true;
    race_day_focus_ = 2;
    nav_.SetRoot(NavNode::RaceRoot);
    nav_.Enter();
    race_sessions_page_ = static_cast<int>(RaceSessionsSubPage::RaceLive);
    ApplyRaceSessionsLocked();
    if (host_ != nullptr) {
        host_->RequestUrgentFullRefresh();
    }
}

void F1PageAdapter::SetRootVisible(lv_obj_t* root, bool visible) {
    if (root == nullptr) {
        return;
    }
    if (visible) {
        lv_obj_clear_flag(root, LV_OBJ_FLAG_HIDDEN);
    } else {
        lv_obj_add_flag(root, LV_OBJ_FLAG_HIDDEN);
    }
}

int F1PageAdapter::UiNavRootSlotCount(NavNode root) {
    (void)root;
    return 4;
}

int F1PageAdapter::UiNavRootFocus(NavNode root) {
    const int physical = root == NavNode::RaceRoot ? race_day_focus_ : off_week_focus_;
    static constexpr std::array<int, 4> kRaceSeq = {1, 0, 3, 2};
    static constexpr std::array<int, 4> kOffSeq = {0, 1, 3, 2};
    const auto& seq = root == NavNode::RaceRoot ? kRaceSeq : kOffSeq;
    for (int i = 0; i < 4; i++) {
        if (seq[static_cast<size_t>(i)] == physical) {
            return i;
        }
    }
    return 0;
}

void F1PageAdapter::UiNavSetRootFocus(NavNode root, int focus) {
    static constexpr std::array<int, 4> kRaceSeq = {1, 0, 3, 2};
    static constexpr std::array<int, 4> kOffSeq = {0, 1, 3, 2};
    if (focus < 0) {
        focus = 0;
    }
    if (focus >= 4) {
        focus %= 4;
    }
    const auto& seq = root == NavNode::RaceRoot ? kRaceSeq : kOffSeq;
    const int physical = seq[static_cast<size_t>(focus)];
    if (root == NavNode::RaceRoot) {
        race_day_focus_ = physical;
    } else {
        off_week_focus_ = physical;
    }
}

bool F1PageAdapter::UiNavResolveChild(NavNode root, int focus, NavNode& out) {
    const auto& table = root == NavNode::RaceRoot ? nav_children_race_ : nav_children_off_;
    static constexpr std::array<int, 4> kRaceSeq = {1, 0, 3, 2};
    static constexpr std::array<int, 4> kOffSeq = {0, 1, 3, 2};
    if (focus < 0) {
        focus = 0;
    }
    if (focus >= 4) {
        focus %= 4;
    }
    const auto& seq = root == NavNode::RaceRoot ? kRaceSeq : kOffSeq;
    const int physical = seq[static_cast<size_t>(focus)];
    if (physical < 0 || physical >= static_cast<int>(table.size())) {
        return false;
    }
    const int8_t child = table[static_cast<size_t>(physical)];
    if (child < 0) {
        return false;
    }
    out = static_cast<NavNode>(child);
    return true;
}

bool F1PageAdapter::UiNavPrev(NavNode node) {
    if (node == NavNode::Wdc) {
        if (wdc_page_ > 0) {
            wdc_page_--;
            ApplyWdcPageLocked();
            return true;
        }
        return false;
    }
    if (node == NavNode::Wcc) {
        if (wcc_page_ > 0) {
            wcc_page_--;
            ApplyWccPageLocked();
            return true;
        }
        return false;
    }
    if (node == NavNode::Circuit) {
        if (circuit_page_ > 0) {
            circuit_page_--;
            ApplyCircuitDetailLocked();
            return true;
        }
        return false;
    }
    if (node == NavNode::RaceSessions) {
        return true;
    }
    return true;
}

void F1PageAdapter::UiNavNext(NavNode node) {
    if (node == NavNode::Wdc) {
        if (wdc_page_ + 1 < wdc_page_count_) {
            wdc_page_++;
            ApplyWdcPageLocked();
        }
        return;
    }
    if (node == NavNode::Wcc) {
        if (wcc_page_ + 1 < wcc_page_count_) {
            wcc_page_++;
            ApplyWccPageLocked();
        }
        return;
    }
    if (node == NavNode::Circuit) {
        if (circuit_page_ < 1) {
            circuit_page_ = 1;
            ApplyCircuitDetailLocked();
        }
        return;
    }
    if (node == NavNode::RaceSessions) {
        return;
    }
}

void F1PageAdapter::UiNavActivate(NavNode node) {
    view_index_ = node == NavNode::RaceRoot ? 0 : static_cast<int>(node);
    ApplyViewLocked();
    if (node == NavNode::Wdc) {
        ApplyWdcPageLocked();
    } else if (node == NavNode::Wcc) {
        ApplyWccPageLocked();
    } else if (node == NavNode::Circuit) {
        ApplyCircuitDetailLocked();
    } else if (node == NavNode::RaceSessions) {
        race_sessions_page_ = static_cast<int>(RaceSessionsSubPage::QualiResult);
        ApplyRaceSessionsLocked();
        StartSessionsFetchIfNeededLocked(true);
    }
}

void F1PageAdapter::BuildWdcDetailLocked() {
    auto* lvgl_theme = static_cast<LvglTheme*>(host_->current_theme_);
    const lv_font_t* cn_font = lvgl_theme && lvgl_theme->text_font() ? lvgl_theme->text_font()->font() : nullptr;
    const lv_font_t* small_font = &lv_font_montserrat_14;
    const lv_font_t* font = cn_font ? cn_font : small_font;

    lv_obj_t* header = lv_obj_create(wdc_root_);
    lv_obj_set_size(header, kPageWidth, kHeaderH);
    lv_obj_align(header, LV_ALIGN_TOP_MID, 0, 0);
    lv_obj_set_style_bg_opa(header, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(header, 1, 0);
    lv_obj_set_style_border_side(header, LV_BORDER_SIDE_BOTTOM, 0);
    lv_obj_set_style_border_color(header, lv_color_black(), 0);
    lv_obj_set_style_pad_left(header, 8, 0);
    lv_obj_set_style_pad_right(header, 8, 0);
    lv_obj_set_style_pad_top(header, 4, 0);
    lv_obj_set_style_pad_bottom(header, 4, 0);

    lv_obj_t* back = lv_label_create(header);
    lv_obj_set_style_text_font(back, font, 0);
    lv_obj_align(back, LV_ALIGN_LEFT_MID, 0, 0);
    lv_label_set_text(back, "[BACK]");

    wdc_title_ = lv_label_create(header);
    lv_obj_set_style_text_font(wdc_title_, font, 0);
    lv_obj_align(wdc_title_, LV_ALIGN_CENTER, 0, 0);
    lv_label_set_text(wdc_title_, "2026 DRIVER STANDINGS (WDC)");

    wdc_page_label_ = lv_label_create(header);
    lv_obj_set_style_text_font(wdc_page_label_, font, 0);
    lv_obj_align(wdc_page_label_, LV_ALIGN_RIGHT_MID, 0, 0);
    lv_label_set_text(wdc_page_label_, "PAGE 01/01");

    lv_obj_t* table = lv_obj_create(wdc_root_);
    StyleBox(table);
    lv_obj_set_size(table, kPageWidth, kPageHeight - kHeaderH);
    lv_obj_align(table, LV_ALIGN_TOP_LEFT, 0, kHeaderH);
    lv_obj_set_style_border_width(table, 0, 0);
    lv_obj_set_style_pad_all(table, 6, 0);

    constexpr lv_coord_t kPosW = 26;
    constexpr lv_coord_t kDrvW = 140;
    constexpr lv_coord_t kTeamW = 86;
    constexpr lv_coord_t kPtsW = 34;
    const lv_coord_t kTrendW = (kPageWidth - 12) - (kPosW + kDrvW + kTeamW + kPtsW);
    const lv_coord_t pts_x = (kPageWidth - 12) - kPtsW - kTrendW;
    (void)pts_x;
    const lv_coord_t team_x = kPosW + kDrvW;
    const lv_coord_t pts2_x = kPosW + kDrvW + kTeamW;
    const lv_coord_t trend_x = pts2_x + kPtsW;

    CreateCellLabel(table, 0, 0, kPosW, "POS", font, LV_TEXT_ALIGN_LEFT, LV_LABEL_LONG_CLIP);
    CreateCellLabel(table, kPosW, 0, kDrvW, "DRIVER", font, LV_TEXT_ALIGN_LEFT, LV_LABEL_LONG_CLIP);
    CreateCellLabel(table, team_x, 0, kTeamW, "TEAM", font, LV_TEXT_ALIGN_LEFT, LV_LABEL_LONG_CLIP);
    CreateCellLabel(table, pts2_x, 0, kPtsW, "PTS", font, LV_TEXT_ALIGN_RIGHT, LV_LABEL_LONG_CLIP);
    CreateCellLabel(table, trend_x, 0, kTrendW, "TREND", font, LV_TEXT_ALIGN_LEFT, LV_LABEL_LONG_CLIP);

    for (int i = 0; i < kWdcRows; i++) {
        const lv_coord_t y = kRowH * (i + 1);
        wdc_cells_[i][0] = CreateCellLabel(table, 0, y, kPosW, "", font, LV_TEXT_ALIGN_LEFT, LV_LABEL_LONG_CLIP);
        wdc_cells_[i][1] = CreateCellLabel(table, kPosW, y, kDrvW, "", font, LV_TEXT_ALIGN_LEFT, LV_LABEL_LONG_DOT);
        wdc_cells_[i][2] = CreateCellLabel(table, team_x, y, kTeamW, "", font, LV_TEXT_ALIGN_LEFT, LV_LABEL_LONG_DOT);
        wdc_cells_[i][3] = CreateCellLabel(table, pts2_x, y, kPtsW, "", font, LV_TEXT_ALIGN_RIGHT, LV_LABEL_LONG_CLIP);
        wdc_cells_[i][4] = CreateCellLabel(table, trend_x, y, kTrendW, "", font, LV_TEXT_ALIGN_LEFT, LV_LABEL_LONG_CLIP);
    }
}

void F1PageAdapter::BuildWccDetailLocked() {
    auto* lvgl_theme = static_cast<LvglTheme*>(host_->current_theme_);
    const lv_font_t* cn_font = lvgl_theme && lvgl_theme->text_font() ? lvgl_theme->text_font()->font() : nullptr;
    const lv_font_t* small_font = &lv_font_montserrat_14;
    const lv_font_t* font = cn_font ? cn_font : small_font;

    lv_obj_t* header = lv_obj_create(wcc_root_);
    lv_obj_set_size(header, kPageWidth, kHeaderH);
    lv_obj_align(header, LV_ALIGN_TOP_MID, 0, 0);
    lv_obj_set_style_bg_opa(header, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(header, 1, 0);
    lv_obj_set_style_border_side(header, LV_BORDER_SIDE_BOTTOM, 0);
    lv_obj_set_style_border_color(header, lv_color_black(), 0);
    lv_obj_set_style_pad_left(header, 8, 0);
    lv_obj_set_style_pad_right(header, 8, 0);
    lv_obj_set_style_pad_top(header, 4, 0);
    lv_obj_set_style_pad_bottom(header, 4, 0);

    lv_obj_t* back = lv_label_create(header);
    lv_obj_set_style_text_font(back, font, 0);
    lv_obj_align(back, LV_ALIGN_LEFT_MID, 0, 0);
    lv_label_set_text(back, "[BACK]");

    wcc_title_ = lv_label_create(header);
    lv_obj_set_style_text_font(wcc_title_, font, 0);
    lv_obj_align(wcc_title_, LV_ALIGN_CENTER, 0, 0);
    lv_label_set_text(wcc_title_, "2026 CONSTRUCTOR STANDINGS (WCC)");

    wcc_page_label_ = lv_label_create(header);
    lv_obj_set_style_text_font(wcc_page_label_, font, 0);
    lv_obj_align(wcc_page_label_, LV_ALIGN_RIGHT_MID, 0, 0);
    lv_label_set_text(wcc_page_label_, "PAGE 01/01");

    lv_obj_t* table = lv_obj_create(wcc_root_);
    StyleBox(table);
    lv_obj_set_size(table, kPageWidth, kPageHeight - kHeaderH);
    lv_obj_align(table, LV_ALIGN_TOP_LEFT, 0, kHeaderH);
    lv_obj_set_style_border_width(table, 0, 0);
    lv_obj_set_style_pad_all(table, 6, 0);

    constexpr lv_coord_t kPosW = 26;
    constexpr lv_coord_t kTeamW = 132;
    constexpr lv_coord_t kPtsW = 36;
    constexpr lv_coord_t kGapW = 40;
    constexpr lv_coord_t kBarW = 86;
    const lv_coord_t kValW = (kPageWidth - 12) - (kPosW + kTeamW + kPtsW + kGapW + kBarW);
    const lv_coord_t x_team = kPosW;
    const lv_coord_t x_pts = x_team + kTeamW;
    const lv_coord_t x_gap = x_pts + kPtsW;
    const lv_coord_t x_bar = x_gap + kGapW;
    const lv_coord_t x_val = x_bar + kBarW;

    CreateCellLabel(table, 0, 0, kPosW, "POS", font, LV_TEXT_ALIGN_LEFT, LV_LABEL_LONG_CLIP);
    CreateCellLabel(table, x_team, 0, kTeamW, "CONSTRUCTOR", font, LV_TEXT_ALIGN_LEFT, LV_LABEL_LONG_CLIP);
    CreateCellLabel(table, x_pts, 0, kPtsW, "PTS", font, LV_TEXT_ALIGN_RIGHT, LV_LABEL_LONG_CLIP);
    CreateCellLabel(table, x_gap, 0, kGapW, "GAP", font, LV_TEXT_ALIGN_RIGHT, LV_LABEL_LONG_CLIP);
    CreateCellLabel(table, x_bar, 0, kBarW, "SPLIT", font, LV_TEXT_ALIGN_LEFT, LV_LABEL_LONG_CLIP);
    CreateCellLabel(table, x_val, 0, kValW, "P1/P2", font, LV_TEXT_ALIGN_RIGHT, LV_LABEL_LONG_CLIP);

    for (int i = 0; i < kWccRows; i++) {
        const lv_coord_t y = kRowH * (i + 1);
        wcc_cells_[i][0] = CreateCellLabel(table, 0, y, kPosW, "", font, LV_TEXT_ALIGN_LEFT, LV_LABEL_LONG_CLIP);
        wcc_cells_[i][1] = CreateCellLabel(table, x_team, y, kTeamW, "", font, LV_TEXT_ALIGN_LEFT, LV_LABEL_LONG_DOT);
        wcc_cells_[i][2] = CreateCellLabel(table, x_pts, y, kPtsW, "", font, LV_TEXT_ALIGN_RIGHT, LV_LABEL_LONG_CLIP);
        wcc_cells_[i][3] = CreateCellLabel(table, x_gap, y, kGapW, "", font, LV_TEXT_ALIGN_RIGHT, LV_LABEL_LONG_CLIP);
        wcc_cells_[i][4] = CreateCellLabel(table, x_bar, y, kBarW, "", font, LV_TEXT_ALIGN_LEFT, LV_LABEL_LONG_CLIP);
        wcc_cells_[i][5] = CreateCellLabel(table, x_val, y, kValW, "", font, LV_TEXT_ALIGN_RIGHT, LV_LABEL_LONG_CLIP);
    }
}

void F1PageAdapter::ApplyWdcPageLocked() {
    if (wdc_page_count_ < 1) {
        wdc_page_count_ = 1;
    }
    if (wdc_page_ < 0) {
        wdc_page_ = 0;
    }
    if (wdc_page_ >= wdc_page_count_) {
        wdc_page_ = wdc_page_count_ - 1;
    }
    if (wdc_page_label_ != nullptr) {
        char buf[32];
        snprintf(buf, sizeof(buf), "PAGE %02d/%02d", wdc_page_ + 1, wdc_page_count_);
        lv_label_set_text(wdc_page_label_, buf);
    }
    const int start = wdc_page_ * kWdcRows;
    for (int i = 0; i < kWdcRows; i++) {
        const int idx = start + i;
        if (idx >= 0 && idx < static_cast<int>(wdc_rows_.size())) {
            auto& r = wdc_rows_[static_cast<size_t>(idx)];
            SetText(wdc_cells_[i][0], r[0].c_str());
            SetText(wdc_cells_[i][1], r[1].c_str());
            SetText(wdc_cells_[i][2], r[2].c_str());
            SetText(wdc_cells_[i][3], r[3].c_str());
            SetText(wdc_cells_[i][4], r[4].c_str());
        } else {
            for (int c = 0; c < kWdcCols; c++) {
                SetText(wdc_cells_[i][c], "");
            }
        }
    }
}

void F1PageAdapter::ApplyWccPageLocked() {
    if (wcc_page_count_ < 1) {
        wcc_page_count_ = 1;
    }
    if (wcc_page_ < 0) {
        wcc_page_ = 0;
    }
    if (wcc_page_ >= wcc_page_count_) {
        wcc_page_ = wcc_page_count_ - 1;
    }
    if (wcc_page_label_ != nullptr) {
        char buf[32];
        snprintf(buf, sizeof(buf), "PAGE %02d/%02d", wcc_page_ + 1, wcc_page_count_);
        lv_label_set_text(wcc_page_label_, buf);
    }
    const int start = wcc_page_ * kWccRows;
    for (int i = 0; i < kWccRows; i++) {
        const int idx = start + i;
        if (idx >= 0 && idx < static_cast<int>(wcc_rows_.size())) {
            auto& r = wcc_rows_[static_cast<size_t>(idx)];
            SetText(wcc_cells_[i][0], r[0].c_str());
            SetText(wcc_cells_[i][1], r[1].c_str());
            SetText(wcc_cells_[i][2], r[2].c_str());
            SetText(wcc_cells_[i][3], r[3].c_str());
            SetText(wcc_cells_[i][4], r[4].c_str());
            SetText(wcc_cells_[i][5], r[5].c_str());
        } else {
            for (int c = 0; c < kWccCols; c++) {
                SetText(wcc_cells_[i][c], "");
            }
        }
    }
}

void F1PageAdapter::RefreshTimerCallback(void* arg) {
    auto* self = static_cast<F1PageAdapter*>(arg);
    if (self == nullptr) {
        return;
    }
    UiPageEvent e{};
    e.type = UiPageEventType::Custom;
    e.i32 = static_cast<int32_t>(UiPageCustomEventId::F1Tick);
    if (self->host_ != nullptr) {
        self->host_->DispatchPageEvent(e, false);
    }
}

void F1PageAdapter::RestartRefreshTimerLocked() {
    if (refresh_timer_ == nullptr) {
        return;
    }
    const int64_t us = refresh_interval_ms_ * 1000;
    if (us <= 0) {
        return;
    }
    (void)esp_timer_stop(refresh_timer_);
    const esp_err_t err = esp_timer_start_periodic(refresh_timer_, us);
    if (err != ESP_OK) {
        ESP_LOGW(kTag, "timer start failed err=%d interval_ms=%lld", static_cast<int>(err), static_cast<long long>(refresh_interval_ms_));
    } else {
        ESP_LOGI(kTag, "timer started interval_ms=%lld", static_cast<long long>(refresh_interval_ms_));
    }
}

void F1PageAdapter::SetText(lv_obj_t* label, const char* text) {
    if (label == nullptr) {
        return;
    }
    lv_label_set_text(label, text ? text : "");
}

void F1PageAdapter::SetTextFmt(lv_obj_t* label, const char* fmt, int v) {
    if (label == nullptr) {
        return;
    }
    char buf[64];
    snprintf(buf, sizeof(buf), fmt, v);
    lv_label_set_text(label, buf);
}

static const char* GetStringOrEmpty(cJSON* obj, const char* key) {
    if (obj == nullptr || key == nullptr) {
        return "";
    }
    cJSON* it = cJSON_GetObjectItemCaseSensitive(obj, key);
    if (cJSON_IsString(it) && it->valuestring != nullptr) {
        return it->valuestring;
    }
    return "";
}

static int GetIntOrNeg(cJSON* obj, const char* key) {
    if (obj == nullptr || key == nullptr) {
        return -1;
    }
    cJSON* it = cJSON_GetObjectItemCaseSensitive(obj, key);
    if (cJSON_IsNumber(it)) {
        return it->valueint;
    }
    return -1;
}

static double GetDoubleOrNeg(cJSON* obj, const char* key) {
    if (obj == nullptr || key == nullptr) {
        return -1;
    }
    cJSON* it = cJSON_GetObjectItemCaseSensitive(obj, key);
    if (cJSON_IsNumber(it)) {
        return it->valuedouble;
    }
    return -1;
}

static cJSON* GetObj(cJSON* obj, const char* key) {
    if (obj == nullptr || key == nullptr) {
        return nullptr;
    }
    cJSON* it = cJSON_GetObjectItemCaseSensitive(obj, key);
    return cJSON_IsObject(it) ? it : nullptr;
}

static cJSON* GetArr(cJSON* obj, const char* key) {
    if (obj == nullptr || key == nullptr) {
        return nullptr;
    }
    cJSON* it = cJSON_GetObjectItemCaseSensitive(obj, key);
    return cJSON_IsArray(it) ? it : nullptr;
}

static int64_t DaysFromCivil(int y, unsigned m, unsigned d) {
    y -= m <= 2;
    const int era = (y >= 0 ? y : y - 399) / 400;
    const unsigned yoe = static_cast<unsigned>(y - era * 400);
    const unsigned doy = (153U * (m + (m > 2 ? static_cast<unsigned>(-3) : 9)) + 2) / 5 + d - 1;
    const unsigned doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    return static_cast<int64_t>(era) * 146097 + static_cast<int64_t>(doe) - 719468;
}

static bool ParseIso8601UtcToUnixSeconds(const char* s, int64_t& out) {
    if (s == nullptr) {
        return false;
    }
    auto is_digit = [](char c) { return c >= '0' && c <= '9'; };
    auto read_n = [&](const char*& p, int n, int& out_v) -> bool {
        int v = 0;
        for (int i = 0; i < n; i++) {
            if (!is_digit(p[i])) {
                return false;
            }
            v = v * 10 + (p[i] - '0');
        }
        p += n;
        out_v = v;
        return true;
    };

    const char* p = s;
    int y = 0, mo = 0, d = 0, hh = 0, mm = 0, ss = 0;
    if (!read_n(p, 4, y) || *p++ != '-' || !read_n(p, 2, mo) || *p++ != '-' || !read_n(p, 2, d)) {
        return false;
    }
    if (*p != 'T' && *p != 't') {
        return false;
    }
    p++;
    if (!read_n(p, 2, hh) || *p++ != ':' || !read_n(p, 2, mm) || *p++ != ':' || !read_n(p, 2, ss)) {
        return false;
    }
    if (*p == '.') {
        p++;
        while (is_digit(*p)) {
            p++;
        }
    }

    char tz_sign = *p;
    int tzh = 0;
    int tzm = 0;
    if (tz_sign == 'Z' || tz_sign == 'z' || tz_sign == '\0') {
        tz_sign = '+';
        tzh = 0;
        tzm = 0;
    } else if (tz_sign == '+' || tz_sign == '-') {
        p++;
        if (!read_n(p, 2, tzh) || *p++ != ':' || !read_n(p, 2, tzm)) {
            return false;
        }
    } else {
        tz_sign = '+';
        tzh = 0;
        tzm = 0;
    }

    const int64_t days = DaysFromCivil(y, static_cast<unsigned>(mo), static_cast<unsigned>(d));
    int64_t sec = days * 86400 + hh * 3600 + mm * 60 + ss;
    const int tz_off = (tzh * 3600 + tzm * 60) * (tz_sign == '-' ? -1 : 1);
    sec -= tz_off;
    out = sec;
    return true;
}

static std::string Upper(std::string s) {
    for (char& c : s) {
        if (c >= 'a' && c <= 'z') {
            c = static_cast<char>(c - 'a' + 'A');
        }
    }
    return s;
}

static std::string NormalizeGpName(std::string s) {
    s = Upper(std::move(s));
    auto trim_ws = [](std::string& x) {
        while (!x.empty() && (x.front() == ' ' || x.front() == '\t')) {
            x.erase(x.begin());
        }
        while (!x.empty() && (x.back() == ' ' || x.back() == '\t')) {
            x.pop_back();
        }
    };
    trim_ws(s);
    const char* kGp = "GRAND PRIX";
    const size_t pos = s.find(kGp);
    if (pos != std::string::npos) {
        s.replace(pos, strlen(kGp), "GP");
    } else if (s.size() < 2 || s.rfind("GP") != s.size() - 2) {
        if (!s.empty()) {
            s += " ";
        }
        s += "GP";
    }
    trim_ws(s);
    return s;
}

bool F1PageAdapter::ApplySessionsJsonLocked(const char* json_text, size_t len) {
    if (json_text == nullptr || len == 0 || len > kMaxJsonBytes) {
        return false;
    }
    cJSON* root = cJSON_ParseWithLength(json_text, len);
    if (root == nullptr) {
        return false;
    }

    cJSON* race = GetObj(root, "race");
    cJSON* sess = GetObj(root, "session");
    cJSON* no_data = cJSON_GetObjectItemCaseSensitive(root, "no_data");
    cJSON* generated_at_utc = cJSON_GetObjectItemCaseSensitive(root, "generated_at_utc");
    const char* country = race ? GetStringOrEmpty(race, "country") : "";
    const char* label = sess ? GetStringOrEmpty(sess, "label") : "";
    const char* kind = sess ? GetStringOrEmpty(sess, "kind") : "";
    const char* time_remain = sess ? GetStringOrEmpty(sess, "time_remain") : "";
    if (country == nullptr || country[0] == 0) {
        country = race ? GetStringOrEmpty(race, "name") : "";
    }

    char left[96];
    if (label && label[0] && country && country[0]) {
        snprintf(left, sizeof(left), "[ %s ] %s", label, country);
    } else if (label && label[0]) {
        snprintf(left, sizeof(left), "[ %s ]", label);
    } else if (country && country[0]) {
        snprintf(left, sizeof(left), "%s", country);
    } else {
        snprintf(left, sizeof(left), "SESSION");
    }
    const auto p = static_cast<RaceSessionsSubPage>(static_cast<uint8_t>(race_sessions_page_));
    if (p == RaceSessionsSubPage::QualiResult && kind && strcmp(kind, "qualifying") == 0) {
        cJSON* results_race = GetObj(root, "results_race");
        const char* rn = results_race ? GetStringOrEmpty(results_race, "name") : "";
        if (rn == nullptr || rn[0] == 0) {
            rn = race ? GetStringOrEmpty(race, "name") : "";
        }
        if (rn == nullptr || rn[0] == 0) {
            rn = country ? country : "";
        }
        const std::string name = NormalizeGpName(rn ? rn : "");
        snprintf(left, sizeof(left), "[QUALI] %s", name.c_str());
    } else if (p == RaceSessionsSubPage::RaceResult && kind && strcmp(kind, "race") == 0) {
        cJSON* results_race = GetObj(root, "results_race");
        const char* rn = results_race ? GetStringOrEmpty(results_race, "name") : "";
        if (rn == nullptr || rn[0] == 0) {
            rn = race ? GetStringOrEmpty(race, "name") : "";
        }
        if (rn == nullptr || rn[0] == 0) {
            rn = country ? country : "";
        }
        const std::string name = NormalizeGpName(rn ? rn : "");
        snprintf(left, sizeof(left), "[FINAL] %s", name.c_str());
    }
    SetText(race_sessions_header_left_, left);

    char center[48];
    if ((p == RaceSessionsSubPage::QualiResult && kind && strcmp(kind, "qualifying") == 0) ||
        (p == RaceSessionsSubPage::RaceResult && kind && strcmp(kind, "race") == 0)) {
        tm local_tm = {};
        bool ok_tm = false;
        auto* rtc = ZectrixGetRtc();
        if (rtc != nullptr && rtc->GetTime(local_tm)) {
            ok_tm = true;
        }
        if (ok_tm) {
            snprintf(center, sizeof(center), "%02d:%02d", local_tm.tm_hour, local_tm.tm_min);
        } else {
            snprintf(center, sizeof(center), "--:--");
        }
    } else {
        if (time_remain && time_remain[0]) {
            snprintf(center, sizeof(center), "TIME REMAIN: %s", time_remain);
        } else {
            snprintf(center, sizeof(center), "TIME REMAIN: --:--");
        }
    }
    SetText(race_sessions_header_center_, center);

    int64_t now_utc_s = 0;
    if (cJSON_IsString(generated_at_utc) && generated_at_utc->valuestring != nullptr) {
        if (ParseIso8601UtcToUnixSeconds(generated_at_utc->valuestring, now_utc_s)) {
            sessions_generated_at_utc_s_ = now_utc_s;
        }
    }
    UpdateBatteryUiLocked();

    const bool is_no_data = cJSON_IsBool(no_data) && cJSON_IsTrue(no_data);
    if (race_sessions_no_data_ != nullptr) {
        if (is_no_data) {
            lv_obj_clear_flag(race_sessions_no_data_, LV_OBJ_FLAG_HIDDEN);
        } else {
            lv_obj_add_flag(race_sessions_no_data_, LV_OBJ_FLAG_HIDDEN);
        }
    }

    cJSON* table = GetObj(root, "table");
    cJSON* rows = table ? GetArr(table, "rows") : nullptr;

    auto clear_practice = [&]() {
        for (auto& r : sessions_practice_cells_) {
            for (auto* c : r) {
                SetText(c, "");
            }
        }
    };
    auto clear_quali = [&]() {
        for (auto& r : sessions_quali_cells_) {
            for (auto* c : r) {
                SetText(c, "");
            }
        }
    };

    if (is_no_data) {
        clear_practice();
        clear_quali();
        quali_result_rows_.clear();
        race_result_rows_.clear();
        quali_result_page_ = 0;
        race_result_page_ = 0;
        quali_result_page_count_ = 1;
        race_result_page_count_ = 1;
        if (sessions_drop_zone_ != nullptr) {
            lv_obj_add_flag(sessions_drop_zone_, LV_OBJ_FLAG_HIDDEN);
        }
        ApplyRaceSessionsLocked();
        cJSON_Delete(root);
        return true;
    }

    if (kind && strcmp(kind, "qualifying") == 0) {
        const int rnd = GetIntOrNeg(race, "round");
        int64_t quali_start_utc_s = 0;
        if (p == RaceSessionsSubPage::QualiResult && now_utc_s > 0 && rnd > 1) {
            cJSON* schedule = GetArr(root, "schedule");
            if (schedule != nullptr) {
                const int n = cJSON_GetArraySize(schedule);
                for (int i = 0; i < n; i++) {
                    cJSON* it = cJSON_GetArrayItem(schedule, i);
                    if (!cJSON_IsObject(it)) {
                        continue;
                    }
                    const char* k = GetStringOrEmpty(it, "key");
                    if (k == nullptr || strcmp(k, "QUALI") != 0) {
                        continue;
                    }
                    const char* s = GetStringOrEmpty(it, "starts_at_utc");
                    if (s != nullptr && s[0] && ParseIso8601UtcToUnixSeconds(s, quali_start_utc_s)) {
                        break;
                    }
                }
            }
        }

        quali_result_rows_.clear();
        const int n = rows ? cJSON_GetArraySize(rows) : 0;
        for (int i = 0; i < n; i++) {
            cJSON* row = cJSON_GetArrayItem(rows, i);
            if (!cJSON_IsObject(row)) {
                continue;
            }
            std::array<std::string, kSessionsQualiCols> r;
            r[0] = GetStringOrEmpty(row, "pos");
            r[1] = GetStringOrEmpty(row, "no");
            r[2] = GetStringOrEmpty(row, "drv");
            r[3] = GetStringOrEmpty(row, "lap_time");
            r[4] = GetStringOrEmpty(row, "gap");
            r[5] = GetStringOrEmpty(row, "st");
            r[6] = GetStringOrEmpty(row, "sec123");
            quali_result_rows_.push_back(std::move(r));
        }
        quali_result_page_count_ = (n + (kSessionsQualiRows - 1)) / kSessionsQualiRows;
        if (quali_result_page_count_ < 1) {
            quali_result_page_count_ = 1;
        }
        if (quali_result_page_ < 0) {
            quali_result_page_ = 0;
        }
        if (quali_result_page_ >= quali_result_page_count_) {
            quali_result_page_ = quali_result_page_count_ - 1;
        }
        ApplyQualiResultPageLocked();

    } else if (kind && (strcmp(kind, "race") == 0 || strcmp(kind, "practice") == 0)) {
        const int rnd = GetIntOrNeg(race, "round");
        int64_t race_start_utc_s = 0;
        if (p == RaceSessionsSubPage::RaceResult && now_utc_s > 0 && rnd > 1) {
            cJSON* schedule = GetArr(root, "schedule");
            if (schedule != nullptr) {
                const int n = cJSON_GetArraySize(schedule);
                for (int i = 0; i < n; i++) {
                    cJSON* it = cJSON_GetArrayItem(schedule, i);
                    if (!cJSON_IsObject(it)) {
                        continue;
                    }
                    const char* k = GetStringOrEmpty(it, "key");
                    if (k == nullptr || strcmp(k, "RACE") != 0) {
                        continue;
                    }
                    const char* s = GetStringOrEmpty(it, "starts_at_utc");
                    if (s != nullptr && s[0] && ParseIso8601UtcToUnixSeconds(s, race_start_utc_s)) {
                        break;
                    }
                }
            }
        }

        race_result_rows_.clear();
        race_result_dnf_.clear();
        const int n = rows ? cJSON_GetArraySize(rows) : 0;
        bool has_dnf = false;
        int dnf_n = 0;
        for (int i = 0; i < n; i++) {
            cJSON* row = cJSON_GetArrayItem(rows, i);
            if (!cJSON_IsObject(row)) {
                continue;
            }
            std::array<std::string, kSessionsPracticeCols> r;
            r[0] = GetStringOrEmpty(row, "pos");
            r[1] = GetStringOrEmpty(row, "no");
            r[2] = GetStringOrEmpty(row, "drv");
            if (kind && strcmp(kind, "race") == 0) {
                const char* gap_status = GetStringOrEmpty(row, "gap_status");
                if (gap_status == nullptr || gap_status[0] == 0) {
                    gap_status = GetStringOrEmpty(row, "status");
                }
                r[3] = gap_status ? gap_status : "";
                r[4] = GetStringOrEmpty(row, "pts");
                r[5] = GetStringOrEmpty(row, "pit");

                const char* st = GetStringOrEmpty(row, "status");
                const bool finished =
                    st == nullptr || st[0] == 0 || strcmp(st, "Finished") == 0 || st[0] == '+' || strstr(st, "Lap") != nullptr;
                if (!finished) {
                    if (!has_dnf) {
                        race_result_dnf_ = "DNF: ";
                        has_dnf = true;
                    } else {
                        race_result_dnf_ += ", ";
                    }
                    race_result_dnf_ += r[2];
                    race_result_dnf_ += " (";
                    race_result_dnf_ += st;
                    race_result_dnf_ += ")";
                    dnf_n++;
                    if (dnf_n >= 6) {
                        break;
                    }
                }
            } else {
                const char* best = GetStringOrEmpty(row, "best_time");
                if (best == nullptr || best[0] == 0) {
                    best = GetStringOrEmpty(row, "best");
                }
                r[3] = best ? best : "";
                r[4] = GetStringOrEmpty(row, "gap");
                r[5] = GetStringOrEmpty(row, "laps");
            }
            race_result_rows_.push_back(std::move(r));
        }
        race_result_page_count_ = (n + (kSessionsPracticeRows - 1)) / kSessionsPracticeRows;
        if (race_result_page_count_ < 1) {
            race_result_page_count_ = 1;
        }
        if (race_result_page_ < 0) {
            race_result_page_ = 0;
        }
        if (race_result_page_ >= race_result_page_count_) {
            race_result_page_ = race_result_page_count_ - 1;
        }
        ApplyRaceResultPageLocked();

    }

    ApplyRaceSessionsLocked();
    cJSON_Delete(root);
    return true;
}

bool F1PageAdapter::ApplyOpenF1WsJsonLocked(const char* json_text, size_t len) {
    if (json_text == nullptr || len == 0 || len > (64 * 1024)) {
        return false;
    }
    cJSON* root = cJSON_ParseWithLength(json_text, len);
    if (root == nullptr) {
        return false;
    }

    const char* topic = GetStringOrEmpty(root, "topic");
    cJSON* payload = GetObj(root, "payload");
    if (topic == nullptr || topic[0] == 0 || payload == nullptr) {
        cJSON_Delete(root);
        return false;
    }

    if (strcmp(topic, "v1/sessions") == 0) {
        const char* circuit = GetStringOrEmpty(payload, "circuit_short_name");
        const char* session_name = GetStringOrEmpty(payload, "session_name");
        char buf[96];
        if (session_name && session_name[0] && circuit && circuit[0]) {
            snprintf(buf, sizeof(buf), "[LIVE] %s %s", session_name, circuit);
        } else if (circuit && circuit[0]) {
            snprintf(buf, sizeof(buf), "[LIVE] %s", circuit);
        } else {
            snprintf(buf, sizeof(buf), "[LIVE]");
        }
        live_header_left_text_ = buf;
    } else if (strcmp(topic, "v1/drivers") == 0) {
        const int no = GetIntOrNeg(payload, "driver_number");
        const char* acr = GetStringOrEmpty(payload, "name_acronym");
        if (no > 0 && acr && acr[0]) {
            live_drivers_[no].acronym = acr;
        }
    } else if (strcmp(topic, "v1/position") == 0) {
        const int no = GetIntOrNeg(payload, "driver_number");
        const int pos = GetIntOrNeg(payload, "position");
        if (no > 0 && pos > 0) {
            live_drivers_[no].pos = pos;
        }
    } else if (strcmp(topic, "v1/intervals") == 0) {
        const int no = GetIntOrNeg(payload, "driver_number");
        const double gap = GetDoubleOrNeg(payload, "gap_to_leader");
        const double interval = GetDoubleOrNeg(payload, "interval");
        if (no > 0) {
            if (gap >= 0) {
                live_drivers_[no].gap_to_leader = gap;
            }
            if (interval >= 0) {
                live_drivers_[no].interval = interval;
            }
        }
    } else if (strcmp(topic, "v1/stints") == 0) {
        const int no = GetIntOrNeg(payload, "driver_number");
        const char* compound = GetStringOrEmpty(payload, "compound");
        const int lap_start = GetIntOrNeg(payload, "lap_start");
        const int lap_end = GetIntOrNeg(payload, "lap_end");
        const int tyre_age_at_start = GetIntOrNeg(payload, "tyre_age_at_start");
        const int stint_number = GetIntOrNeg(payload, "stint_number");
        if (no > 0 && compound && compound[0]) {
            if (lap_end <= 0) {
                auto& d = live_drivers_[no];
                if (stint_number > 0 && (d.stint_number < 0 || stint_number >= d.stint_number)) {
                    d.stint_number = stint_number;
                }
                d.tyre_compound = compound;
                if (tyre_age_at_start >= 0) {
                    d.tyre_age_at_start = tyre_age_at_start;
                }
                if (lap_start > 0) {
                    d.stint_lap_start = lap_start;
                }
            }
        }
    } else if (strcmp(topic, "v1/weather") == 0) {
        {
            const double t = GetDoubleOrNeg(payload, "track_temperature");
            if (t >= 0) {
                live_track_temp_c_ = t;
            }
        }
        {
            const double t = GetDoubleOrNeg(payload, "air_temperature");
            if (t >= 0) {
                live_air_temp_c_ = t;
            }
        }
        {
            const int v = GetIntOrNeg(payload, "humidity");
            if (v >= 0) {
                live_humidity_ = v;
            }
        }
    } else if (strcmp(topic, "v1/race_control") == 0) {
        const char* category = GetStringOrEmpty(payload, "category");
        const char* flag = GetStringOrEmpty(payload, "flag");
        const int lap = GetIntOrNeg(payload, "lap_number");
        if (lap > 0) {
            live_lap_number_ = lap;
        }
        if (category && strcmp(category, "Flag") == 0 && flag && flag[0]) {
            char buf[32];
            snprintf(buf, sizeof(buf), "[ %s ]", flag);
            live_track_status_text_ = buf;
        }
    } else if (strcmp(topic, "v1/laps") == 0) {
        const int no = GetIntOrNeg(payload, "driver_number");
        const int lap_no = GetIntOrNeg(payload, "lap_number");
        const double lap_s = GetDoubleOrNeg(payload, "lap_duration");
        if (no > 0 && lap_no > 0 && lap_s > 0) {
            if (live_best_lap_s_ < 0 || lap_s < live_best_lap_s_) {
                live_best_lap_s_ = lap_s;
                live_best_lap_driver_ = no;
                live_best_lap_number_ = lap_no;
            }
        }
    }

    cJSON_Delete(root);
    return true;
}

void F1PageAdapter::ApplyLiveFromStateLocked() {
    if (live_header_left_ != nullptr) {
        if (!live_header_left_text_.empty()) {
            SetText(live_header_left_, live_header_left_text_.c_str());
        }
    }
    if (live_header_center_ != nullptr) {
        char buf[48];
        if (live_lap_number_ > 0) {
            snprintf(buf, sizeof(buf), "LAP %d", live_lap_number_);
        } else {
            snprintf(buf, sizeof(buf), "LAP --");
        }
        SetText(live_header_center_, buf);
    }
    if (live_track_status_ != nullptr) {
        SetText(live_track_status_, live_track_status_text_.c_str());
    }
    if (live_temps_ != nullptr) {
        char buf[64];
        const int track = (live_track_temp_c_ > -100) ? static_cast<int>(live_track_temp_c_ + 0.5) : -1;
        const int air = (live_air_temp_c_ > -100) ? static_cast<int>(live_air_temp_c_ + 0.5) : -1;
        const int hum = live_humidity_;
        snprintf(buf, sizeof(buf),
                 "TRACK: %s\nAIR:   %s\nHUM:   %s",
                 track >= 0 ? (std::to_string(track) + "C").c_str() : "--",
                 air >= 0 ? (std::to_string(air) + "C").c_str() : "--",
                 hum >= 0 ? (std::to_string(hum) + "%").c_str() : "--");
        SetText(live_temps_, buf);
    }

    struct Row {
        int no = -1;
        int pos = -1;
        double gap = -1;
        double interval = -1;
        std::string acr;
        std::string tyre;
    };
    std::vector<Row> rows;
    rows.reserve(live_drivers_.size());
    for (const auto& kv : live_drivers_) {
        const int no = kv.first;
        const auto& d = kv.second;
        if (no <= 0 || d.pos <= 0) {
            continue;
        }
        Row r;
        r.no = no;
        r.pos = d.pos;
        r.gap = d.gap_to_leader;
        r.interval = d.interval;
        r.acr = d.acronym;
        if (!d.tyre_compound.empty()) {
            char c = d.tyre_compound[0];
            if (d.tyre_compound == "SOFT") {
                c = 'S';
            } else if (d.tyre_compound == "MEDIUM") {
                c = 'M';
            } else if (d.tyre_compound == "HARD") {
                c = 'H';
            } else if (d.tyre_compound == "INTERMEDIATE") {
                c = 'I';
            } else if (d.tyre_compound == "WET") {
                c = 'W';
            }
            int age = -1;
            if (live_lap_number_ > 0 && d.stint_lap_start > 0) {
                age = live_lap_number_ - d.stint_lap_start;
                if (age < 0) {
                    age = 0;
                }
                if (d.tyre_age_at_start >= 0) {
                    age += d.tyre_age_at_start;
                }
            } else if (d.tyre_age_at_start >= 0) {
                age = d.tyre_age_at_start;
            }
            if (age >= 0) {
                if (age > 99) {
                    age = 99;
                }
                char buf[8];
                snprintf(buf, sizeof(buf), "%c%d", c, age);
                r.tyre = buf;
            } else {
                r.tyre = std::string(1, c);
            }
        } else {
            r.tyre = "--";
        }
        rows.push_back(std::move(r));
    }
    std::sort(rows.begin(), rows.end(), [](const Row& a, const Row& b) {
        return a.pos < b.pos;
    });

    auto fmt_gap = [&](const Row& r) -> std::string {
        if (r.pos == 1) {
            return "---";
        }
        const double v = (r.interval >= 0) ? r.interval : r.gap;
        if (v < 0) {
            return "+--";
        }
        char b[24];
        snprintf(b, sizeof(b), "+%.3f", v);
        return b;
    };

    for (int i = 0; i < kLiveRows; i++) {
        if (live_cells_[static_cast<size_t>(i)][0] == nullptr) {
            continue;
        }
        if (i >= static_cast<int>(rows.size())) {
            SetText(live_cells_[static_cast<size_t>(i)][0], "");
            SetText(live_cells_[static_cast<size_t>(i)][1], "");
            SetText(live_cells_[static_cast<size_t>(i)][2], "");
            SetText(live_cells_[static_cast<size_t>(i)][3], "");
            SetText(live_cells_[static_cast<size_t>(i)][4], "");
            continue;
        }
        const Row& r = rows[static_cast<size_t>(i)];
        char pos[8];
        char no[8];
        snprintf(pos, sizeof(pos), "%02d", r.pos);
        snprintf(no, sizeof(no), "%02d", r.no);
        const std::string acr = !r.acr.empty() ? r.acr : ("#" + std::to_string(r.no));
        const std::string gap = fmt_gap(r);
        SetText(live_cells_[static_cast<size_t>(i)][0], pos);
        SetText(live_cells_[static_cast<size_t>(i)][1], no);
        SetText(live_cells_[static_cast<size_t>(i)][2], acr.c_str());
        SetText(live_cells_[static_cast<size_t>(i)][3], gap.c_str());
        SetText(live_cells_[static_cast<size_t>(i)][4], r.tyre.c_str());
    }

    if (live_fastest_lap_ != nullptr) {
        if (live_best_lap_s_ > 0 && live_best_lap_driver_ > 0) {
            const double s = live_best_lap_s_;
            const int mm = static_cast<int>(s / 60.0);
            const double ss = s - (mm * 60.0);
            const int ssi = static_cast<int>(ss);
            const int ms = static_cast<int>((ss - ssi) * 1000.0 + 0.5);
            char t[32];
            snprintf(t, sizeof(t), "%d:%02d.%03d", mm, ssi, ms);
            const auto it = live_drivers_.find(live_best_lap_driver_);
            const std::string acr = (it != live_drivers_.end() && !it->second.acronym.empty())
                                        ? it->second.acronym
                                        : ("#" + std::to_string(live_best_lap_driver_));
            char buf[96];
            snprintf(buf, sizeof(buf),
                     "#%d %s\n%s (L%d)",
                     live_best_lap_driver_,
                     acr.c_str(),
                     t,
                     live_best_lap_number_ > 0 ? live_best_lap_number_ : 0);
            SetText(live_fastest_lap_, buf);
        }
    }
}

void F1PageAdapter::ApplyQualiResultPageLocked() {
    for (auto& r : sessions_quali_cells_) {
        for (auto* c : r) {
            SetText(c, "");
        }
    }
    if (sessions_drop_zone_ != nullptr) {
        lv_obj_add_flag(sessions_drop_zone_, LV_OBJ_FLAG_HIDDEN);
    }

    const int n = static_cast<int>(quali_result_rows_.size());
    if (n <= 0) {
        return;
    }
    if (quali_result_page_count_ < 1) {
        quali_result_page_count_ = 1;
    }
    if (quali_result_page_ < 0) {
        quali_result_page_ = 0;
    }
    if (quali_result_page_ >= quali_result_page_count_) {
        quali_result_page_ = quali_result_page_count_ - 1;
    }
    const int start = quali_result_page_ * kSessionsQualiRows;
    for (int slot = 0; slot < kSessionsQualiRows; slot++) {
        const int idx = start + slot;
        if (idx < 0 || idx >= n) {
            continue;
        }
        const auto& row = quali_result_rows_[static_cast<size_t>(idx)];
        for (int c = 0; c < kSessionsQualiCols; c++) {
            SetText(sessions_quali_cells_[static_cast<size_t>(slot)][static_cast<size_t>(c)], row[static_cast<size_t>(c)].c_str());
        }
    }
}

void F1PageAdapter::ApplyRaceResultPageLocked() {
    for (auto& r : sessions_practice_cells_) {
        for (auto* c : r) {
            SetText(c, "");
        }
    }

    const int n = static_cast<int>(race_result_rows_.size());
    if (n <= 0) {
        return;
    }
    if (race_result_page_count_ < 1) {
        race_result_page_count_ = 1;
    }
    if (race_result_page_ < 0) {
        race_result_page_ = 0;
    }
    if (race_result_page_ >= race_result_page_count_) {
        race_result_page_ = race_result_page_count_ - 1;
    }
    const int start = race_result_page_ * kSessionsPracticeRows;
    for (int slot = 0; slot < kSessionsPracticeRows; slot++) {
        const int idx = start + slot;
        if (idx < 0 || idx >= n) {
            continue;
        }
        const auto& row = race_result_rows_[static_cast<size_t>(idx)];
        for (int c = 0; c < kSessionsPracticeCols; c++) {
            SetText(sessions_practice_cells_[static_cast<size_t>(slot)][static_cast<size_t>(c)], row[static_cast<size_t>(c)].c_str());
        }
    }
    if (race_sessions_race_dnf_ != nullptr) {
        lv_label_set_text(race_sessions_race_dnf_, race_result_dnf_.c_str());
    }
}

bool F1PageAdapter::ApplyUiJsonLocked(const char* json_text, size_t len) {
    if (json_text == nullptr || len == 0) {
        return false;
    }
    cJSON* root = cJSON_ParseWithLength(json_text, len);
    if (root == nullptr) {
        return false;
    }

    cJSON* pages = cJSON_GetObjectItemCaseSensitive(root, "pages");
    cJSON* race_day = pages ? cJSON_GetObjectItemCaseSensitive(pages, "race_day")
                            : cJSON_GetObjectItemCaseSensitive(root, "race_day");
    cJSON* off_week = pages ? cJSON_GetObjectItemCaseSensitive(pages, "off_week")
                            : cJSON_GetObjectItemCaseSensitive(root, "off_week");

    cJSON* default_page = cJSON_GetObjectItemCaseSensitive(root, "default_page");
    if (cJSON_IsString(default_page) && default_page->valuestring != nullptr) {
        if (strcmp(default_page->valuestring, "race_day") == 0) {
            if (nav_.IsAtRoot()) {
                nav_.SetRoot(NavNode::RaceRoot);
            }
        } else if (strcmp(default_page->valuestring, "off_week") == 0) {
            if (nav_.IsAtRoot()) {
                nav_.SetRoot(NavNode::OffRoot);
            }
        }
    }

    cJSON* is_race_week = cJSON_GetObjectItemCaseSensitive(root, "is_race_week");
    if (cJSON_IsBool(is_race_week)) {
        const bool v = cJSON_IsTrue(is_race_week);
        is_race_week_ = v;
        refresh_interval_ms_ = v ? (10LL * 60 * 1000) : (60LL * 60 * 1000);
        RestartRefreshTimerLocked();
    }

    cJSON* details = cJSON_GetObjectItemCaseSensitive(root, "details");
    if (details && cJSON_IsObject(details)) {
        cJSON* wdc = cJSON_GetObjectItemCaseSensitive(details, "wdc");
        if (wdc && cJSON_IsObject(wdc)) {
            SetText(wdc_title_, GetStringOrEmpty(wdc, "title"));
            wdc_rows_.clear();
            cJSON* pages_arr = cJSON_GetObjectItemCaseSensitive(wdc, "pages");
            if (pages_arr && cJSON_IsArray(pages_arr)) {
                wdc_page_count_ = cJSON_GetArraySize(pages_arr);
                if (wdc_page_count_ < 1) {
                    wdc_page_count_ = 1;
                }
                const int pages_n = cJSON_GetArraySize(pages_arr);
                for (int pi = 0; pi < pages_n; pi++) {
                    cJSON* page = cJSON_GetArrayItem(pages_arr, pi);
                    cJSON* rows = page ? cJSON_GetObjectItemCaseSensitive(page, "rows") : nullptr;
                    if (!rows || !cJSON_IsArray(rows)) {
                        continue;
                    }
                    const int rn = cJSON_GetArraySize(rows);
                    for (int ri = 0; ri < rn; ri++) {
                        cJSON* row = cJSON_GetArrayItem(rows, ri);
                        if (!row || !cJSON_IsObject(row)) {
                            continue;
                        }
                        const int pos = GetIntOrNeg(row, "pos");
                        const int pts = GetIntOrNeg(row, "points");
                        char posbuf[16];
                        char ptsbuf[12];
                        snprintf(posbuf, sizeof(posbuf), "%02d", pos >= 0 ? pos : 0);
                        snprintf(ptsbuf, sizeof(ptsbuf), "%d", pts >= 0 ? pts : 0);
                        std::array<std::string, kWdcCols> r;
                        r[0] = posbuf;
                        r[1] = GetStringOrEmpty(row, "driver");
                        r[2] = GetStringOrEmpty(row, "team");
                        r[3] = ptsbuf;
                        r[4] = GetStringOrEmpty(row, "trend");
                        wdc_rows_.push_back(std::move(r));
                    }
                }
            } else {
                wdc_page_count_ = 1;
            }
            ApplyWdcPageLocked();
        }

        cJSON* wcc = cJSON_GetObjectItemCaseSensitive(details, "wcc");
        if (wcc && cJSON_IsObject(wcc)) {
            SetText(wcc_title_, GetStringOrEmpty(wcc, "title"));
            wcc_rows_.clear();
            cJSON* pages_arr = cJSON_GetObjectItemCaseSensitive(wcc, "pages");
            if (pages_arr && cJSON_IsArray(pages_arr)) {
                wcc_page_count_ = cJSON_GetArraySize(pages_arr);
                if (wcc_page_count_ < 1) {
                    wcc_page_count_ = 1;
                }
                const int pages_n = cJSON_GetArraySize(pages_arr);
                for (int pi = 0; pi < pages_n; pi++) {
                    cJSON* page = cJSON_GetArrayItem(pages_arr, pi);
                    cJSON* rows = page ? cJSON_GetObjectItemCaseSensitive(page, "rows") : nullptr;
                    if (!rows || !cJSON_IsArray(rows)) {
                        continue;
                    }
                    const int rn = cJSON_GetArraySize(rows);
                    for (int ri = 0; ri < rn; ri++) {
                        cJSON* row = cJSON_GetArrayItem(rows, ri);
                        if (!row || !cJSON_IsObject(row)) {
                            continue;
                        }
                        const int pos = GetIntOrNeg(row, "pos");
                        const int pts = GetIntOrNeg(row, "points");
                        const char* gap = GetStringOrEmpty(row, "gap");
                        const char* bar = GetStringOrEmpty(row, "split_bar");
                        const char* val = GetStringOrEmpty(row, "split_value");
                        char posbuf[16];
                        char ptsbuf[12];
                        snprintf(posbuf, sizeof(posbuf), "%02d", pos >= 0 ? pos : 0);
                        snprintf(ptsbuf, sizeof(ptsbuf), "%d", pts >= 0 ? pts : 0);
                        std::array<std::string, kWccCols> r;
                        r[0] = posbuf;
                        r[1] = GetStringOrEmpty(row, "constructor");
                        r[2] = ptsbuf;
                        r[3] = gap ? gap : "";
                        r[4] = bar ? bar : "";
                        r[5] = val ? val : "";
                        wcc_rows_.push_back(std::move(r));
                    }
                }
            } else {
                wcc_page_count_ = 1;
            }
            ApplyWccPageLocked();
        }
    }

    if (race_day && cJSON_IsObject(race_day)) {
        UpdateBatteryUiLocked();

        cJSON* race = cJSON_GetObjectItemCaseSensitive(race_day, "race");
        SetText(race_gp_, GetStringOrEmpty(race, "grand_prix"));
        SetText(race_round_, GetStringOrEmpty(race, "round"));

        cJSON* next_session = cJSON_GetObjectItemCaseSensitive(race_day, "next_session");
        SetText(race_next_label_, GetStringOrEmpty(next_session, "label"));
        SetText(race_countdown_, GetStringOrEmpty(next_session, "countdown"));

        cJSON* next_gp = cJSON_GetObjectItemCaseSensitive(race_day, "next_gp");
        SetText(race_next_gp_, GetStringOrEmpty(next_gp, "text"));
        RenderRaceRightFormula1Locked();

        cJSON* sched = cJSON_GetObjectItemCaseSensitive(race_day, "schedule");
        cJSON* rows = sched ? cJSON_GetObjectItemCaseSensitive(sched, "rows") : nullptr;
        for (int i = 0; i < kScheduleRows; i++) {
            const char* session = "";
            const char* day = "";
            const char* time = "";
            const char* status = "";
            cJSON* row = (rows && cJSON_IsArray(rows)) ? cJSON_GetArrayItem(rows, i) : nullptr;
            if (row && cJSON_IsObject(row)) {
                session = GetStringOrEmpty(row, "session");
                day = GetStringOrEmpty(row, "day");
                time = GetStringOrEmpty(row, "time");
                status = GetStringOrEmpty(row, "status");
            }
            SetText(schedule_cells_[i][0], session);
            SetText(schedule_cells_[i][1], day);
            SetText(schedule_cells_[i][2], time);
            SetText(schedule_cells_[i][3], status);
        }

        cJSON* weather = cJSON_GetObjectItemCaseSensitive(race_day, "weather");
        cJSON* w_rows = weather ? cJSON_GetObjectItemCaseSensitive(weather, "rows") : nullptr;
        for (int i = 0; i < kWeatherRows; i++) {
            const char* k = "";
            const char* v = "";
            cJSON* row = (w_rows && cJSON_IsArray(w_rows)) ? cJSON_GetArrayItem(w_rows, i) : nullptr;
            if (row && cJSON_IsObject(row)) {
                k = GetStringOrEmpty(row, "k");
                v = GetStringOrEmpty(row, "v");
            }
            SetText(weather_k_[i], k);
            SetText(weather_v_[i], v);
        }

        cJSON* circuit = cJSON_GetObjectItemCaseSensitive(race_day, "circuit");
        circuit_name_ = GetStringOrEmpty(circuit, "circuit_name");
        circuit_gp_ = GetStringOrEmpty(circuit, "name");
        circuit_map_url_small_ = GetStringOrEmpty(circuit, "map_image_url");
        circuit_map_url_detail_ = GetStringOrEmpty(circuit, "map_image_url_detail");
        ESP_LOGI(kTag, "circuit urls small=%s detail=%s",
                 circuit_map_url_small_.c_str(),
                 circuit_map_url_detail_.c_str());
        circuit_length_km_ = GetDoubleOrNeg(circuit, "circuit_length_km");
        race_distance_km_ = GetDoubleOrNeg(circuit, "race_distance_km");
        number_of_laps_ = GetIntOrNeg(circuit, "number_of_laps");
        first_grand_prix_year_ = GetIntOrNeg(circuit, "first_grand_prix_year");
        fastest_lap_time_ = GetStringOrEmpty(circuit, "fastest_lap_time");
        fastest_lap_driver_ = GetStringOrEmpty(circuit, "fastest_lap_driver");
        fastest_lap_year_ = GetIntOrNeg(circuit, "fastest_lap_year");

        StartCircuitFetchIfNeededLocked(circuit_map_url_small_.c_str());
        StartCircuitDetailFetchIfNeededLocked(circuit_map_url_detail_.c_str());
        if (view_index_ == 4) {
            ApplyCircuitDetailLocked();
        }
    }

    if (off_week && cJSON_IsObject(off_week)) {
        cJSON* header = cJSON_GetObjectItemCaseSensitive(off_week, "header");
        SetText(standings_header_left_, GetStringOrEmpty(header, "left"));
        SetText(standings_header_right_, GetStringOrEmpty(header, "right"));

        cJSON* days = cJSON_GetObjectItemCaseSensitive(off_week, "days");
        int dval = GetIntOrNeg(days, "value");
        const char* until = GetStringOrEmpty(days, "until");
        if (dval >= 0) {
            char buf[96];
            snprintf(buf, sizeof(buf), "%d\nDAYS\nUNTIL %s", dval, until ? until : "");
            SetText(standings_days_, buf);
        } else {
            SetText(standings_days_, "");
        }

        cJSON* dt = cJSON_GetObjectItemCaseSensitive(off_week, "drivers_table");
        cJSON* dt_rows = dt ? cJSON_GetObjectItemCaseSensitive(dt, "rows") : nullptr;
        for (int i = 0; i < kDriverRows; i++) {
            cJSON* row = (dt_rows && cJSON_IsArray(dt_rows)) ? cJSON_GetArrayItem(dt_rows, i) : nullptr;
            if (row && cJSON_IsObject(row)) {
                const int pos = GetIntOrNeg(row, "pos");
                if (pos >= 0) {
                    SetTextFmt(driver_cells_[i][0], "%d.", pos);
                } else {
                    SetText(driver_cells_[i][0], "");
                }
                SetText(driver_cells_[i][1], GetStringOrEmpty(row, "name"));
                SetText(driver_cells_[i][2], GetStringOrEmpty(row, "code"));
                const int pts = GetIntOrNeg(row, "points");
                if (pts >= 0) {
                    SetTextFmt(driver_cells_[i][3], "%d", pts);
                } else {
                    SetText(driver_cells_[i][3], "");
                }
            } else {
                for (int c = 0; c < kDriverCols; c++) {
                    SetText(driver_cells_[i][c], "");
                }
            }
        }

        cJSON* ct = cJSON_GetObjectItemCaseSensitive(off_week, "constructors_table");
        cJSON* ct_rows = ct ? cJSON_GetObjectItemCaseSensitive(ct, "rows") : nullptr;
        for (int i = 0; i < kConstructorRows; i++) {
            cJSON* row = (ct_rows && cJSON_IsArray(ct_rows)) ? cJSON_GetArrayItem(ct_rows, i) : nullptr;
            if (row && cJSON_IsObject(row)) {
                const int pos = GetIntOrNeg(row, "pos");
                if (pos >= 0) {
                    SetTextFmt(constructor_cells_[i][0], "%d.", pos);
                } else {
                    SetText(constructor_cells_[i][0], "");
                }
                SetText(constructor_cells_[i][1], GetStringOrEmpty(row, "name"));
                const int pts = GetIntOrNeg(row, "points");
                if (pts >= 0) {
                    SetTextFmt(constructor_cells_[i][2], "%d", pts);
                } else {
                    SetText(constructor_cells_[i][2], "");
                }
            } else {
                for (int c = 0; c < kConstructorCols; c++) {
                    SetText(constructor_cells_[i][c], "");
                }
            }
        }

        cJSON* news = cJSON_GetObjectItemCaseSensitive(off_week, "news");
        const char* title = GetStringOrEmpty(news, "title");
        const char* url = GetStringOrEmpty(news, "url");
        if (title && title[0]) {
            char buf[256];
            snprintf(buf, sizeof(buf), "NEWS FLASH:\n%s", title);
            SetText(news_, buf);
        } else {
            SetText(news_, "NEWS FLASH:");
        }

        const char* news_id = GetStringOrEmpty(news, "id");
        std::string effective_id;
        if (news_id && news_id[0]) {
            effective_id = news_id;
        } else if (title && title[0]) {
            char tmp[384];
            snprintf(tmp, sizeof(tmp), "%s|%s", title, url ? url : "");
            char hex[16];
            snprintf(hex, sizeof(hex), "%08x", static_cast<unsigned>(Fnv1a32(tmp)));
            effective_id = hex;
        }

        if (!effective_id.empty()) {
            Settings s("f1", true);
            const std::string last_id = s.GetString("last_news_id", "");
            bool need_play = false;
            if (!news_beeped_this_boot_) {
                need_play = true;
                news_beeped_this_boot_ = true;
            } else if (last_id != effective_id) {
                need_play = true;
            }
            if (need_play) {
                (void)PlayJuWav();
            }
            if (last_id != effective_id) {
                s.SetString("last_news_id", effective_id);
            }
        }
    }

    cJSON_Delete(root);
    return true;
}
