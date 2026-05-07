#include "pages/wifi_setup_page_adapter.h"

#include "assets_fs.h"
#include "lcd_display.h"
#include "lvgl_theme.h"

#include <algorithm>
#include <cstring>
#include <string>

#include "esp_log.h"
#include "pngle.h"

namespace {

constexpr const char* kTag = "WifiSetupPage";

constexpr lv_coord_t kPageWidth = 400;
constexpr lv_coord_t kPageHeight = 300;

constexpr lv_coord_t kInfoAreaH = 140;

static inline uint8_t Luma8(uint8_t r, uint8_t g, uint8_t b) {
    return static_cast<uint8_t>((static_cast<uint32_t>(r) * 30U + static_cast<uint32_t>(g) * 59U +
                                 static_cast<uint32_t>(b) * 11U) /
                                100U);
}

struct SplashPngleCtx {
    std::vector<uint8_t>* out = nullptr;
    int target_w = 0;
    int target_h = 0;
    bool ok = true;
};

bool PngleFeedAll(pngle_t* p, const uint8_t* data, size_t size) {
    if (p == nullptr || data == nullptr || size == 0) {
        return false;
    }
    size_t off = 0;
    while (off < size) {
        const int r = pngle_feed(p, data + off, size - off);
        if (r < 0) {
            return false;
        }
        if (r == 0) {
            break;
        }
        off += static_cast<size_t>(r);
    }
    return off == size;
}

void SplashPngleOnInit(pngle_t* pngle, uint32_t w, uint32_t h) {
    auto* ctx = static_cast<SplashPngleCtx*>(pngle_get_user_data(pngle));
    if (ctx == nullptr || ctx->out == nullptr) {
        return;
    }
    if (w == 0 || h == 0) {
        ctx->ok = false;
        return;
    }
    if (ctx->target_w > 0 && static_cast<int>(w) != ctx->target_w) {
        ctx->ok = false;
        return;
    }
    if (ctx->target_h > 0 && static_cast<int>(h) != ctx->target_h) {
        ctx->ok = false;
        return;
    }
    const int row_bytes = (static_cast<int>(w) + 7) >> 3;
    ctx->out->assign(static_cast<size_t>(row_bytes) * static_cast<size_t>(h), 0x00);
}

void SplashPngleOnDraw(pngle_t* pngle,
                       uint32_t x,
                       uint32_t y,
                       uint32_t w,
                       uint32_t h,
                       const uint8_t rgba[4]) {
    auto* ctx = static_cast<SplashPngleCtx*>(pngle_get_user_data(pngle));
    if (ctx == nullptr || ctx->out == nullptr || !ctx->ok) {
        return;
    }
    if (ctx->out->empty() || ctx->target_w <= 0 || ctx->target_h <= 0) {
        ctx->ok = false;
        return;
    }

    const uint8_t a = rgba[3];
    uint8_t r = rgba[0];
    uint8_t g = rgba[1];
    uint8_t b = rgba[2];

    if (a == 0) {
        r = 255;
        g = 255;
        b = 255;
    }

    const uint8_t l = Luma8(r, g, b);
    const bool black = a != 0 && l < 128;
    const int row_bytes = (ctx->target_w + 7) >> 3;
    for (uint32_t yy = 0; yy < h; yy++) {
        const uint32_t dy = y + yy;
        if (dy >= static_cast<uint32_t>(ctx->target_h)) {
            continue;
        }
        for (uint32_t xx = 0; xx < w; xx++) {
            const uint32_t dx = x + xx;
            if (dx >= static_cast<uint32_t>(ctx->target_w)) {
                continue;
            }
            const size_t idx = static_cast<size_t>(dy) * static_cast<size_t>(row_bytes) + static_cast<size_t>(dx >> 3);
            const uint8_t mask = static_cast<uint8_t>(1U << (7 - (dx & 7U)));
            if (black) {
                (*ctx->out)[idx] |= mask;
            } else {
                (*ctx->out)[idx] &= static_cast<uint8_t>(~mask);
            }
        }
    }
}

void StyleScreen(lv_obj_t* obj) {
    lv_obj_set_size(obj, kPageWidth, kPageHeight);
    lv_obj_set_style_bg_color(obj, lv_color_white(), 0);
    lv_obj_set_style_bg_opa(obj, LV_OPA_COVER, 0);
    lv_obj_set_style_border_width(obj, 0, 0);
    lv_obj_set_style_pad_all(obj, 0, 0);
}

void StyleInfoArea(lv_obj_t* obj) {
    lv_obj_set_style_bg_color(obj, lv_color_white(), 0);
    lv_obj_set_style_bg_opa(obj, LV_OPA_COVER, 0);
    lv_obj_set_style_border_width(obj, 1, 0);
    lv_obj_set_style_border_side(obj, LV_BORDER_SIDE_TOP, 0);
    lv_obj_set_style_border_color(obj, lv_color_black(), 0);
    lv_obj_set_style_pad_left(obj, 14, 0);
    lv_obj_set_style_pad_right(obj, 14, 0);
    lv_obj_set_style_pad_top(obj, 8, 0);
    lv_obj_set_style_pad_bottom(obj, 8, 0);
    lv_obj_set_style_pad_row(obj, 4, 0);
    lv_obj_set_flex_flow(obj, LV_FLEX_FLOW_COLUMN);
}

}  // namespace

WifiSetupPageAdapter::WifiSetupPageAdapter(LcdDisplay* host) : host_(host) {}

void WifiSetupPageAdapter::LoadSplashLocked() {
    if (!built_ || splash_area_ == nullptr) {
        return;
    }

    if (!EnsureAssetsMounted()) {
        ESP_LOGW(kTag, "assets not mounted");
        if (splash_hint_label_ != nullptr) {
            lv_label_set_text(splash_hint_label_, "启动图缺失：assets未挂载");
            lv_obj_clear_flag(splash_hint_label_, LV_OBJ_FLAG_HIDDEN);
        }
        return;
    }

    if (host_ != nullptr && splash_active_ && splash_w_ > 0 && splash_h_ > 0) {
        host_->UpdatePicRegion(splash_x_, splash_y_, splash_w_, splash_h_, nullptr, 0);
        splash_active_ = false;
    }

    splash_bin_.clear();
    splash_x_ = 0;
    splash_y_ = 0;
    splash_w_ = 0;
    splash_h_ = 0;

    lv_obj_update_layout(splash_area_);
    splash_x_ = static_cast<int>(lv_obj_get_x(splash_area_));
    splash_y_ = static_cast<int>(lv_obj_get_y(splash_area_));
    splash_w_ = static_cast<int>(lv_obj_get_width(splash_area_));
    splash_h_ = static_cast<int>(lv_obj_get_height(splash_area_));
    if (splash_w_ <= 0 || splash_h_ <= 0) {
        splash_x_ = 0;
        splash_y_ = 0;
        splash_w_ = static_cast<int>(kPageWidth);
        splash_h_ = static_cast<int>(kPageHeight - kInfoAreaH);
    }
    if (splash_w_ <= 0 || splash_h_ <= 0) {
        return;
    }

    const char* candidates[] = {
        "wifi/setup.bin",
        "wifi/setup.png",
        "wifi/wifi_setup.png",
        "wifi/splash.png",
    };

    for (const char* path : candidates) {
        std::vector<uint8_t> bytes;
        const size_t max_bytes = (path && strstr(path, ".bin") != nullptr)
                                     ? static_cast<size_t>(((splash_w_ + 7) >> 3) * splash_h_)
                                     : 600 * 1024;
        if (!ReadAssetsFile(path, bytes, max_bytes)) {
            ESP_LOGW(kTag, "splash missing path=%s", path);
            continue;
        }

        if (path && strstr(path, ".bin") != nullptr) {
            const size_t expected = static_cast<size_t>(((splash_w_ + 7) >> 3) * splash_h_);
            if (bytes.size() != expected) {
                ESP_LOGW(kTag, "splash bin size mismatch path=%s got=%u exp=%u",
                         path,
                         static_cast<unsigned>(bytes.size()),
                         static_cast<unsigned>(expected));
                continue;
            }
            splash_bin_ = std::move(bytes);
            if (host_ != nullptr) {
                host_->UpdatePicRegion(splash_x_, splash_y_, splash_w_, splash_h_, splash_bin_.data(), splash_bin_.size());
                host_->RequestUrgentFullRefresh();
            }
            splash_active_ = true;
            if (splash_hint_label_ != nullptr) {
                lv_obj_add_flag(splash_hint_label_, LV_OBJ_FLAG_HIDDEN);
            }
            if (splash_image_ != nullptr) {
                lv_obj_add_flag(splash_image_, LV_OBJ_FLAG_HIDDEN);
            }
            ESP_LOGI(kTag, "splash loaded(bin) path=%s", path);
            return;
        }

        SplashPngleCtx ctx;
        ctx.out = &splash_bin_;
        ctx.target_w = splash_w_;
        ctx.target_h = splash_h_;

        pngle_t* p = pngle_new();
        if (p == nullptr) {
            ESP_LOGW(kTag, "pngle_new failed");
            continue;
        }
        pngle_set_user_data(p, &ctx);
        pngle_set_init_callback(p, &SplashPngleOnInit);
        pngle_set_draw_callback(p, &SplashPngleOnDraw);
        const bool ok = PngleFeedAll(p, bytes.data(), bytes.size());
        const char* err = pngle_error(p);
        pngle_destroy(p);
        if (!ok || !ctx.ok) {
            ESP_LOGW(kTag, "pngle decode failed path=%s err=%s", path, err != nullptr ? err : "");
            splash_bin_.clear();
            continue;
        }
        if (splash_bin_.empty()) {
            ESP_LOGW(kTag, "pngle decode empty path=%s", path);
            continue;
        }

        if (host_ != nullptr) {
            host_->UpdatePicRegion(splash_x_, splash_y_, splash_w_, splash_h_, splash_bin_.data(), splash_bin_.size());
            host_->RequestUrgentFullRefresh();
        }
        splash_active_ = true;
        if (splash_hint_label_ != nullptr) {
            lv_obj_add_flag(splash_hint_label_, LV_OBJ_FLAG_HIDDEN);
        }
        if (splash_image_ != nullptr) {
            lv_obj_add_flag(splash_image_, LV_OBJ_FLAG_HIDDEN);
        }

        ESP_LOGI(kTag, "splash loaded path=%s", path);
        return;
    }

    if (splash_image_ != nullptr) {
        lv_obj_add_flag(splash_image_, LV_OBJ_FLAG_HIDDEN);
    }
    if (splash_hint_label_ != nullptr) {
        lv_label_set_text(splash_hint_label_, "启动图缺失：/assets/wifi/setup.bin 或 setup.png");
        lv_obj_clear_flag(splash_hint_label_, LV_OBJ_FLAG_HIDDEN);
    }
}

UiPageId WifiSetupPageAdapter::Id() const {
    return UiPageId::WifiSetup;
}

const char* WifiSetupPageAdapter::Name() const {
    return "WifiSetup";
}

void WifiSetupPageAdapter::Build() {
    if (built_ || host_ == nullptr) {
        built_ = true;
        return;
    }
    if (host_->wifi_setup_screen_ != nullptr) {
        screen_ = host_->wifi_setup_screen_;
        built_ = true;
        return;
    }

    auto* lvgl_theme = static_cast<LvglTheme*>(host_->current_theme_);
    const lv_font_t* text_font = lvgl_theme->text_font() ? lvgl_theme->text_font()->font() : nullptr;
    const lv_font_t* body_font = lvgl_theme->reminder_text_font()
                                     ? lvgl_theme->reminder_text_font()->font()
                                     : text_font;

    screen_ = lv_obj_create(nullptr);
    host_->wifi_setup_screen_ = screen_;
    StyleScreen(screen_);

    splash_area_ = lv_obj_create(screen_);
    lv_obj_set_size(splash_area_, kPageWidth, kPageHeight - kInfoAreaH);
    lv_obj_align(splash_area_, LV_ALIGN_TOP_LEFT, 0, 0);
    lv_obj_set_style_bg_opa(splash_area_, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(splash_area_, 0, 0);
    lv_obj_set_style_pad_all(splash_area_, 0, 0);

    splash_image_ = lv_image_create(splash_area_);
    lv_obj_align(splash_image_, LV_ALIGN_CENTER, 0, 0);

    splash_hint_label_ = lv_label_create(splash_area_);
    if (text_font != nullptr) {
        lv_obj_set_style_text_font(splash_hint_label_, text_font, 0);
    }
    lv_obj_set_width(splash_hint_label_, LV_PCT(100));
    lv_label_set_long_mode(splash_hint_label_, LV_LABEL_LONG_WRAP);
    lv_obj_set_style_text_align(splash_hint_label_, LV_TEXT_ALIGN_LEFT, 0);
    lv_obj_align(splash_hint_label_, LV_ALIGN_TOP_LEFT, 4, 4);
    lv_label_set_text(splash_hint_label_, "启动图缺失(v2)：/assets/wifi/setup.bin 或 setup.png");

    splash_blank_dsc_ = {};
    splash_blank_dsc_.header.magic = LV_IMAGE_HEADER_MAGIC;
    splash_blank_dsc_.header.cf = LV_COLOR_FORMAT_RGB565;
    splash_blank_dsc_.header.w = 1;
    splash_blank_dsc_.header.h = 1;
    splash_blank_dsc_.data_size = 2;
    splash_blank_dsc_.data = reinterpret_cast<const uint8_t*>(&splash_blank_px_);

    lv_obj_t* info_area = lv_obj_create(screen_);
    StyleInfoArea(info_area);
    lv_obj_set_size(info_area, kPageWidth, kInfoAreaH);
    lv_obj_align(info_area, LV_ALIGN_BOTTOM_LEFT, 0, 0);

    title_label_ = lv_label_create(info_area);
    if (body_font != nullptr) {
        lv_obj_set_style_text_font(title_label_, body_font, 0);
    }
    lv_label_set_text(title_label_, "首次启动 - WiFi 配置");

    ssid_label_ = lv_label_create(info_area);
    url_label_ = lv_label_create(info_area);
    steps_label_ = lv_label_create(info_area);
    status_label_ = lv_label_create(info_area);
    if (text_font != nullptr) {
        lv_obj_set_style_text_font(ssid_label_, text_font, 0);
        lv_obj_set_style_text_font(url_label_, text_font, 0);
        lv_obj_set_style_text_font(steps_label_, text_font, 0);
        lv_obj_set_style_text_font(status_label_, text_font, 0);
    }
    lv_obj_set_width(ssid_label_, LV_PCT(100));
    lv_obj_set_width(url_label_, LV_PCT(100));
    lv_obj_set_width(steps_label_, LV_PCT(100));
    lv_obj_set_width(status_label_, LV_PCT(100));
    lv_label_set_long_mode(ssid_label_, LV_LABEL_LONG_WRAP);
    lv_label_set_long_mode(url_label_, LV_LABEL_LONG_WRAP);
    lv_label_set_long_mode(steps_label_, LV_LABEL_LONG_WRAP);
    lv_label_set_long_mode(status_label_, LV_LABEL_LONG_WRAP);

    built_ = true;
    RefreshLabelsLocked();
}

lv_obj_t* WifiSetupPageAdapter::Screen() const {
    return screen_;
}

void WifiSetupPageAdapter::OnShow() {
    if (screen_ != nullptr) {
        lv_obj_update_layout(screen_);
    }
    LoadSplashLocked();
    RefreshLabelsLocked();
}

void WifiSetupPageAdapter::OnHide() {
    if (!built_) {
        return;
    }

    if (splash_image_ != nullptr) {
        lv_img_set_zoom(splash_image_, 256);
        lv_image_set_src(splash_image_, &splash_blank_dsc_);
        lv_obj_add_flag(splash_image_, LV_OBJ_FLAG_HIDDEN);
    }
    if (splash_hint_label_ != nullptr) {
        lv_obj_add_flag(splash_hint_label_, LV_OBJ_FLAG_HIDDEN);
    }

    if (host_ != nullptr && splash_active_ && splash_w_ > 0 && splash_h_ > 0) {
        host_->UpdatePicRegion(splash_x_, splash_y_, splash_w_, splash_h_, nullptr, 0);
        host_->RequestUrgentFullRefresh();
    }
    splash_active_ = false;

    const size_t bytes = splash_bin_.size();
    std::vector<uint8_t>().swap(splash_bin_);
    splash_x_ = 0;
    splash_y_ = 0;
    splash_w_ = 0;
    splash_h_ = 0;
    if (bytes > 0) {
        ESP_LOGI(kTag, "splash released bytes=%u", static_cast<unsigned>(bytes));
    }
}

bool WifiSetupPageAdapter::HandleEvent(const UiPageEvent& event) {
    (void)event;
    return false;
}

void WifiSetupPageAdapter::UpdateInfo(const std::string& ap_ssid,
                                      const std::string& web_url,
                                      const std::string& status) {
    ap_ssid_ = ap_ssid;
    web_url_ = web_url;
    status_ = status;
    RefreshLabelsLocked();
}

void WifiSetupPageAdapter::RefreshLabelsLocked() {
    if (!built_ || screen_ == nullptr) {
        return;
    }

    const char* ssid = ap_ssid_.empty() ? "(准备中)" : ap_ssid_.c_str();
    const char* url = web_url_.empty() ? "http://192.168.4.1" : web_url_.c_str();
    const char* status = status_.empty() ? "状态：等待进入配网模式..." : status_.c_str();

    lv_label_set_text_fmt(ssid_label_, "热点名称: %s", ssid);
    lv_label_set_text_fmt(url_label_, "配置地址: %s", url);
    lv_label_set_text(
        steps_label_,
        "1. 连接热点  2. 打开配置地址\n"
        "3. 选择 WiFi 保存  4. 完成/退出");
    lv_label_set_text(status_label_, status);
}
