#include "pages/gallery_page_adapter.h"

#include "assets_fs.h"
#include "lcd_display.h"
#include "lvgl_theme.h"
#include "settings.h"

#include <algorithm>
#include <cstdio>
#include <cstring>
#include <memory>

#include "esp_http_client.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "pngle.h"

#include "cJSON.h"

namespace {

constexpr const char* kTag = "GalleryPage";

constexpr lv_coord_t kPageWidth = 400;
constexpr lv_coord_t kPageHeight = 300;

constexpr lv_coord_t kTopPadding = 8;
constexpr lv_coord_t kTitleHeight = 30;
constexpr lv_coord_t kBottomHeight = 26;

constexpr size_t kMaxJsonBytes = 32 * 1024;
constexpr size_t kMaxImageBytes = 600 * 1024;
constexpr int kMaxImages = 10;

constexpr int32_t kEventStatus = 1;
constexpr int32_t kEventUpdate = 2;

struct GalleryUpdatePayload {
    std::string status;
    std::vector<std::pair<std::string, std::vector<uint8_t>>> images;
};

struct LoaderArg {
    GalleryPageAdapter* page = nullptr;
    LcdDisplay* host = nullptr;
};

void StyleScreen(lv_obj_t* obj) {
    lv_obj_set_size(obj, kPageWidth, kPageHeight);
    lv_obj_set_style_bg_color(obj, lv_color_white(), 0);
    lv_obj_set_style_bg_opa(obj, LV_OPA_COVER, 0);
    lv_obj_set_style_border_width(obj, 0, 0);
    lv_obj_set_style_pad_all(obj, 0, 0);
}

bool ParsePngSize(const uint8_t* data, size_t size, uint32_t& w, uint32_t& h) {
    static const uint8_t sig[8] = {0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a};
    if (size < 24) {
        return false;
    }
    if (memcmp(data, sig, sizeof(sig)) != 0) {
        return false;
    }
    w = (static_cast<uint32_t>(data[16]) << 24) | (static_cast<uint32_t>(data[17]) << 16) |
        (static_cast<uint32_t>(data[18]) << 8) | static_cast<uint32_t>(data[19]);
    h = (static_cast<uint32_t>(data[20]) << 24) | (static_cast<uint32_t>(data[21]) << 16) |
        (static_cast<uint32_t>(data[22]) << 8) | static_cast<uint32_t>(data[23]);
    return w > 0 && h > 0;
}

bool IsHttpUrl(const std::string& s) {
    return s.rfind("http://", 0) == 0 || s.rfind("https://", 0) == 0;
}

struct Pngle1bppCtx {
    std::vector<uint8_t>* out = nullptr;
    int dst_w = 0;
    int dst_h = 0;
    uint32_t src_w = 0;
    uint32_t src_h = 0;
    int draw_w = 0;
    int draw_h = 0;
    int off_x = 0;
    int off_y = 0;
    bool ok = true;
};

static inline uint8_t Luma8(uint8_t r, uint8_t g, uint8_t b) {
    return static_cast<uint8_t>((static_cast<uint32_t>(r) * 30U + static_cast<uint32_t>(g) * 59U +
                                 static_cast<uint32_t>(b) * 11U) /
                                100U);
}

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

static inline void SetPacked1bppBlack1(uint8_t* dst, int w, int x, int y, bool black) {
    const int row_bytes = (w + 7) >> 3;
    const size_t idx = static_cast<size_t>(y) * static_cast<size_t>(row_bytes) + static_cast<size_t>(x >> 3);
    const uint8_t mask = static_cast<uint8_t>(1U << (7 - (x & 7)));
    if (black) {
        dst[idx] |= mask;
    } else {
        dst[idx] &= static_cast<uint8_t>(~mask);
    }
}

void Pngle1bppOnInit(pngle_t* pngle, uint32_t w, uint32_t h) {
    auto* ctx = static_cast<Pngle1bppCtx*>(pngle_get_user_data(pngle));
    if (ctx == nullptr || ctx->out == nullptr) {
        return;
    }
    if (ctx->dst_w <= 0 || ctx->dst_h <= 0 || w == 0 || h == 0) {
        ctx->ok = false;
        return;
    }
    ctx->src_w = w;
    ctx->src_h = h;
    const double sx = static_cast<double>(ctx->dst_w) / static_cast<double>(w);
    const double sy = static_cast<double>(ctx->dst_h) / static_cast<double>(h);
    const double s = std::min(sx, sy);
    ctx->draw_w = std::max(1, static_cast<int>(static_cast<double>(w) * s));
    ctx->draw_h = std::max(1, static_cast<int>(static_cast<double>(h) * s));
    ctx->off_x = (ctx->dst_w - ctx->draw_w) / 2;
    ctx->off_y = (ctx->dst_h - ctx->draw_h) / 2;
    const int row_bytes = (ctx->dst_w + 7) >> 3;
    ctx->out->assign(static_cast<size_t>(row_bytes) * static_cast<size_t>(ctx->dst_h), 0x00);
}

void Pngle1bppOnDraw(pngle_t* pngle,
                     uint32_t x,
                     uint32_t y,
                     uint32_t w,
                     uint32_t h,
                     const uint8_t rgba[4]) {
    auto* ctx = static_cast<Pngle1bppCtx*>(pngle_get_user_data(pngle));
    if (ctx == nullptr || ctx->out == nullptr || !ctx->ok || ctx->out->empty()) {
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

    const uint32_t sx0 = x;
    const uint32_t sy0 = y;
    const uint32_t sx1 = x + w;
    const uint32_t sy1 = y + h;
    for (uint32_t sy = sy0; sy < sy1; sy++) {
        if (sy >= ctx->src_h) {
            continue;
        }
        const int dy0 = ctx->off_y + static_cast<int>((static_cast<uint64_t>(sy) * static_cast<uint64_t>(ctx->draw_h)) / ctx->src_h);
        const int dy1 = ctx->off_y + static_cast<int>(((static_cast<uint64_t>(sy + 1) * static_cast<uint64_t>(ctx->draw_h)) / ctx->src_h) - 1);
        for (uint32_t sx = sx0; sx < sx1; sx++) {
            if (sx >= ctx->src_w) {
                continue;
            }
            const int dx0 = ctx->off_x + static_cast<int>((static_cast<uint64_t>(sx) * static_cast<uint64_t>(ctx->draw_w)) / ctx->src_w);
            const int dx1 = ctx->off_x + static_cast<int>(((static_cast<uint64_t>(sx + 1) * static_cast<uint64_t>(ctx->draw_w)) / ctx->src_w) - 1);
            for (int dy = dy0; dy <= dy1; dy++) {
                if (dy < 0 || dy >= ctx->dst_h) {
                    continue;
                }
                for (int dx = dx0; dx <= dx1; dx++) {
                    if (dx < 0 || dx >= ctx->dst_w) {
                        continue;
                    }
                    SetPacked1bppBlack1(ctx->out->data(), ctx->dst_w, dx, dy, black);
                }
            }
        }
    }
}

std::string Trim(const std::string& s) {
    size_t b = 0;
    while (b < s.size() && (s[b] == ' ' || s[b] == '\n' || s[b] == '\r' || s[b] == '\t')) {
        b++;
    }
    size_t e = s.size();
    while (e > b && (s[e - 1] == ' ' || s[e - 1] == '\n' || s[e - 1] == '\r' || s[e - 1] == '\t')) {
        e--;
    }
    return s.substr(b, e - b);
}

bool HttpGetToBuffer(const std::string& url, std::vector<uint8_t>& out, size_t max_bytes) {
    esp_http_client_config_t config = {};
    config.url = url.c_str();
    config.timeout_ms = 8000;
    config.method = HTTP_METHOD_GET;

    esp_http_client_handle_t client = esp_http_client_init(&config);
    if (client == nullptr) {
        return false;
    }

    const esp_err_t open_ret = esp_http_client_open(client, 0);
    if (open_ret != ESP_OK) {
        esp_http_client_cleanup(client);
        return false;
    }

    int64_t cl = esp_http_client_fetch_headers(client);
    if (cl > 0 && static_cast<size_t>(cl) > max_bytes) {
        esp_http_client_close(client);
        esp_http_client_cleanup(client);
        return false;
    }

    out.clear();
    out.reserve(cl > 0 ? static_cast<size_t>(cl) : 4096);

    uint8_t buf[1024];
    while (true) {
        const int r = esp_http_client_read(client, reinterpret_cast<char*>(buf), sizeof(buf));
        if (r < 0) {
            esp_http_client_close(client);
            esp_http_client_cleanup(client);
            return false;
        }
        if (r == 0) {
            break;
        }
        if (out.size() + static_cast<size_t>(r) > max_bytes) {
            esp_http_client_close(client);
            esp_http_client_cleanup(client);
            return false;
        }
        out.insert(out.end(), buf, buf + r);
    }

    esp_http_client_close(client);
    esp_http_client_cleanup(client);
    return !out.empty();
}

bool LoadJsonImageList(std::vector<std::string>& out_sources) {
    out_sources.clear();
    Settings s("gallery");
    std::string url = Trim(s.GetString("json_url", ""));
    std::vector<uint8_t> json_bytes;

    if (!url.empty()) {
        if (!HttpGetToBuffer(url, json_bytes, kMaxJsonBytes)) {
            return false;
        }
    } else {
        if (!ReadAssetsFile("gallery/list.json", json_bytes, kMaxJsonBytes)) {
            return false;
        }
    }

    std::string json_text(json_bytes.begin(), json_bytes.end());
    cJSON* root = cJSON_ParseWithLength(json_text.c_str(), json_text.size());
    if (root == nullptr) {
        return false;
    }

    cJSON* arr = nullptr;
    if (cJSON_IsArray(root)) {
        arr = root;
    } else if (cJSON_IsObject(root)) {
        arr = cJSON_GetObjectItem(root, "images");
    }

    if (arr == nullptr || !cJSON_IsArray(arr)) {
        cJSON_Delete(root);
        return false;
    }

    const int n = cJSON_GetArraySize(arr);
    for (int i = 0; i < n && static_cast<int>(out_sources.size()) < kMaxImages; i++) {
        cJSON* it = cJSON_GetArrayItem(arr, i);
        if (cJSON_IsString(it) && it->valuestring != nullptr) {
            out_sources.emplace_back(Trim(it->valuestring));
        } else if (cJSON_IsObject(it)) {
            cJSON* src = cJSON_GetObjectItem(it, "src");
            if (cJSON_IsString(src) && src->valuestring != nullptr) {
                out_sources.emplace_back(Trim(src->valuestring));
            }
        }
    }

    cJSON_Delete(root);
    out_sources.erase(std::remove_if(out_sources.begin(),
                                     out_sources.end(),
                                     [](const std::string& v) { return v.empty(); }),
                      out_sources.end());
    return !out_sources.empty();
}

std::string NormalizeAssetImagePath(const std::string& src) {
    if (src.rfind("assets:", 0) == 0) {
        return src.substr(7);
    }
    if (src.rfind("spiffs:", 0) == 0) {
        return src.substr(7);
    }
    return src;
}

void LoaderTask(void* arg) {
    std::unique_ptr<LoaderArg> a(static_cast<LoaderArg*>(arg));
    if (!a || a->page == nullptr || a->host == nullptr) {
        vTaskDelete(nullptr);
        return;
    }
    LcdDisplay* host = a->host;

    auto send_status = [host](const char* text) {
        UiPageEvent e;
        e.type = UiPageEventType::Custom;
        e.i32 = kEventStatus;
        auto* payload = new GalleryUpdatePayload();
        payload->status = text ? text : "";
        e.ptr = payload;
        host->DispatchPageEvent(e, false);
    };

    send_status("LOADING LIST...");

    std::vector<std::string> sources;
    if (!LoadJsonImageList(sources)) {
        auto* payload = new GalleryUpdatePayload();
        payload->status = "NO LIST: gallery/list.json OR gallery.json_url";
        UiPageEvent e;
        e.type = UiPageEventType::Custom;
        e.i32 = kEventUpdate;
        e.ptr = payload;
        host->DispatchPageEvent(e, false);
        vTaskDelete(nullptr);
        return;
    }

    auto* payload = new GalleryUpdatePayload();
    payload->status = "LOADING IMAGES...";

    for (const auto& src_raw : sources) {
        std::vector<uint8_t> bytes;
        const std::string src = Trim(src_raw);
        if (IsHttpUrl(src)) {
            if (!HttpGetToBuffer(src, bytes, kMaxImageBytes)) {
                ESP_LOGW(kTag, "load image failed from url: %s", src.c_str());
                continue;
            }
        } else {
            const std::string p = NormalizeAssetImagePath(src);
            if (!ReadAssetsFile(p, bytes, kMaxImageBytes)) {
                ESP_LOGW(kTag, "load image failed from assets: %s", p.c_str());
                continue;
            }
        }
        ESP_LOGI(kTag, "loaded image src=%s bytes=%u", src.c_str(), static_cast<unsigned>(bytes.size()));
        payload->images.emplace_back(src, std::move(bytes));
        if (static_cast<int>(payload->images.size()) >= kMaxImages) {
            break;
        }
    }

    UiPageEvent e;
    e.type = UiPageEventType::Custom;
    e.i32 = kEventUpdate;
    e.ptr = payload;
    host->DispatchPageEvent(e, false);
    vTaskDelete(nullptr);
}

}  // namespace

GalleryPageAdapter::GalleryPageAdapter(LcdDisplay* host) : host_(host) {}

UiPageId GalleryPageAdapter::Id() const {
    return UiPageId::Gallery;
}

const char* GalleryPageAdapter::Name() const {
    return "Gallery";
}

void GalleryPageAdapter::Build() {
    if (built_ || host_ == nullptr) {
        built_ = true;
        return;
    }
    if (host_->gallery_screen_ != nullptr) {
        screen_ = host_->gallery_screen_;
        built_ = true;
        return;
    }

    auto* lvgl_theme = static_cast<LvglTheme*>(host_->current_theme_);
    const lv_font_t* title_font = lvgl_theme->reminder_text_font() ? lvgl_theme->reminder_text_font()->font() : nullptr;
    const lv_font_t* text_font = lvgl_theme->text_font() ? lvgl_theme->text_font()->font() : nullptr;

    screen_ = lv_obj_create(nullptr);
    host_->gallery_screen_ = screen_;
    StyleScreen(screen_);

    title_label_ = lv_label_create(screen_);
    if (title_font != nullptr) {
        lv_obj_set_style_text_font(title_label_, title_font, 0);
    }
    lv_label_set_text(title_label_, "图片展示");
    lv_obj_align(title_label_, LV_ALIGN_TOP_MID, 0, kTopPadding);

    status_label_ = lv_label_create(screen_);
    if (text_font != nullptr) {
        lv_obj_set_style_text_font(status_label_, text_font, 0);
    }
    lv_obj_set_style_text_color(status_label_, lv_color_black(), 0);
    lv_obj_set_width(status_label_, kPageWidth - 16);
    lv_label_set_long_mode(status_label_, LV_LABEL_LONG_WRAP);
    lv_label_set_text(status_label_, "WAITING...");
    lv_obj_align(status_label_, LV_ALIGN_TOP_MID, 0, kTopPadding + kTitleHeight);

    image_ = lv_image_create(screen_);
    lv_obj_align(image_, LV_ALIGN_CENTER, 0, 10);

    indicator_label_ = lv_label_create(screen_);
    if (text_font != nullptr) {
        lv_obj_set_style_text_font(indicator_label_, text_font, 0);
    }
    lv_obj_set_style_text_color(indicator_label_, lv_color_black(), 0);
    lv_label_set_text(indicator_label_, "");
    lv_obj_align(indicator_label_, LV_ALIGN_BOTTOM_MID, 0, -6);

    built_ = true;
}

lv_obj_t* GalleryPageAdapter::Screen() const {
    return screen_;
}

void GalleryPageAdapter::OnShow() {
    active_ = true;
    if (!built_ || host_ == nullptr || loading_) {
        return;
    }
    loading_ = true;
    auto* arg = new LoaderArg();
    arg->page = this;
    arg->host = host_;
    (void)xTaskCreate(LoaderTask, "gallery_loader", 6144, arg, 4, nullptr);
}

void GalleryPageAdapter::OnHide() {
    active_ = false;
    loading_ = false;
    if (host_ != nullptr && pic_active_ && pic_w_ > 0 && pic_h_ > 0) {
        host_->UpdatePicRegion(pic_x_, pic_y_, pic_w_, pic_h_, nullptr, 0);
        host_->RequestUrgentFullRefresh();
    }
    pic_active_ = false;
    std::vector<uint8_t>().swap(pic_bin_);
    pic_x_ = 0;
    pic_y_ = 0;
    pic_w_ = 0;
    pic_h_ = 0;
}

void GalleryPageAdapter::ApplyIndex(int index) {
    if (entries_.empty() || image_ == nullptr) {
        return;
    }
    if (index < 0) {
        index = 0;
    }
    if (index >= static_cast<int>(entries_.size())) {
        index = static_cast<int>(entries_.size()) - 1;
    }
    current_index_ = index;

    const auto& cur = entries_[static_cast<size_t>(current_index_)];
    const lv_coord_t box_w = kPageWidth - 20;
    const lv_coord_t box_h = kPageHeight - (kTopPadding + kTitleHeight + kBottomHeight + 12);
    lv_obj_set_size(image_, box_w, box_h);
    lv_obj_align(image_, LV_ALIGN_CENTER, 0, 10);
    lv_obj_add_flag(image_, LV_OBJ_FLAG_HIDDEN);

    if (host_ != nullptr && pic_active_ && pic_w_ > 0 && pic_h_ > 0) {
        host_->UpdatePicRegion(pic_x_, pic_y_, pic_w_, pic_h_, nullptr, 0);
        pic_active_ = false;
    }

    lv_area_t a{};
    lv_obj_get_coords(image_, &a);
    pic_x_ = a.x1;
    pic_y_ = a.y1;
    pic_w_ = a.x2 - a.x1 + 1;
    pic_h_ = a.y2 - a.y1 + 1;
    if (pic_w_ <= 0 || pic_h_ <= 0 || cur.bytes.empty()) {
        return;
    }

    Pngle1bppCtx ctx;
    ctx.out = &pic_bin_;
    ctx.dst_w = pic_w_;
    ctx.dst_h = pic_h_;

    pngle_t* p = pngle_new();
    if (p == nullptr) {
        return;
    }
    pngle_set_user_data(p, &ctx);
    pngle_set_init_callback(p, &Pngle1bppOnInit);
    pngle_set_draw_callback(p, &Pngle1bppOnDraw);
    const bool ok = PngleFeedAll(p, cur.bytes.data(), cur.bytes.size());
    pngle_destroy(p);
    if (!ok || !ctx.ok || pic_bin_.empty()) {
        std::vector<uint8_t>().swap(pic_bin_);
        return;
    }
    host_->UpdatePicRegion(pic_x_, pic_y_, pic_w_, pic_h_, pic_bin_.data(), pic_bin_.size());
    host_->RequestUrgentFullRefresh();
    pic_active_ = true;

    if (indicator_label_ != nullptr) {
        char buf[32];
        snprintf(buf, sizeof(buf), "%d/%d", current_index_ + 1, static_cast<int>(entries_.size()));
        lv_label_set_text(indicator_label_, buf);
    }
}

bool GalleryPageAdapter::HandleEvent(const UiPageEvent& event) {
    if (event.type != UiPageEventType::Custom) {
        return false;
    }
    if (event.i32 == static_cast<int32_t>(UiPageCustomEventId::GalleryPrev)) {
        if (!active_) {
            return false;
        }
        if (!loading_ && !entries_.empty()) {
            const int n = static_cast<int>(entries_.size());
            const int next = (current_index_ - 1 + n) % n;
            ApplyIndex(next);
        }
        return true;
    }
    if (event.i32 == static_cast<int32_t>(UiPageCustomEventId::GalleryNext)) {
        if (!active_) {
            return false;
        }
        if (!loading_ && !entries_.empty()) {
            const int n = static_cast<int>(entries_.size());
            const int next = (current_index_ + 1) % n;
            ApplyIndex(next);
        }
        return true;
    }
    if (event.i32 == kEventStatus) {
        std::unique_ptr<GalleryUpdatePayload> payload(static_cast<GalleryUpdatePayload*>(event.ptr));
        if (!active_) {
            loading_ = false;
            return true;
        }
        if (payload && status_label_ != nullptr) {
            lv_label_set_text(status_label_, payload->status.c_str());
        }
        return true;
    }
    if (event.i32 == kEventUpdate) {
        std::unique_ptr<GalleryUpdatePayload> payload(static_cast<GalleryUpdatePayload*>(event.ptr));
        if (!active_) {
            loading_ = false;
            return true;
        }
        entries_.clear();
        current_index_ = 0;
        if (payload) {
            if (status_label_ != nullptr) {
                lv_label_set_text(status_label_, payload->status.c_str());
            }
            entries_.reserve(payload->images.size());
            for (auto& it : payload->images) {
                GalleryEntry e;
                e.src = std::move(it.first);
                e.bytes = std::move(it.second);
                if (!e.bytes.empty()) {
                    uint32_t w = 0, h = 0;
                    if (ParsePngSize(e.bytes.data(), e.bytes.size(), w, h)) {
                        e.w = w;
                        e.h = h;
                    }
                    entries_.push_back(std::move(e));
                }
            }
        }

        if (entries_.empty()) {
            if (status_label_ != nullptr) {
                lv_label_set_text(status_label_, "NO IMAGE TO DISPLAY");
            }
            if (indicator_label_ != nullptr) {
                lv_label_set_text(indicator_label_, "");
            }
            loading_ = false;
            return true;
        }

        ApplyIndex(0);
        if (status_label_ != nullptr) {
            lv_label_set_text(status_label_, "LOADED");
        }
        loading_ = false;
        return true;
    }
    return false;
}
