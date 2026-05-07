#include "pages/meme_page_adapter.h"

#include "lcd_display.h"
#include "lvgl_theme.h"

#include <font_zectrix.h>

#include <algorithm>
#include <cstdio>
#include <cstring>

#include "pngle.h"

LV_FONT_DECLARE(BUILTIN_TEXT_FONT);

namespace {

constexpr lv_coord_t kPageWidth = 400;
constexpr lv_coord_t kPageHeight = 300;

constexpr lv_coord_t kPad = 8;
constexpr lv_coord_t kTitleH = 44;

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

void StyleScreen(lv_obj_t* obj) {
    lv_obj_set_size(obj, kPageWidth, kPageHeight);
    lv_obj_set_style_bg_color(obj, lv_color_white(), 0);
    lv_obj_set_style_bg_opa(obj, LV_OPA_COVER, 0);
    lv_obj_set_style_border_width(obj, 0, 0);
    lv_obj_set_style_pad_all(obj, kPad, 0);
}

}  // namespace

MemePageAdapter::MemePageAdapter(LcdDisplay* host) : host_(host) {
}

UiPageId MemePageAdapter::Id() const {
    return UiPageId::Meme;
}

const char* MemePageAdapter::Name() const {
    return "Meme";
}

void MemePageAdapter::Build() {
    if (built_ || host_ == nullptr) {
        built_ = true;
        return;
    }
    if (host_->meme_screen_ != nullptr) {
        screen_ = host_->meme_screen_;
        built_ = true;
        return;
    }

    screen_ = lv_obj_create(nullptr);
    host_->meme_screen_ = screen_;
    StyleScreen(screen_);

    auto* lvgl_theme = static_cast<LvglTheme*>(host_->current_theme_);
    const lv_font_t* font = (lvgl_theme && lvgl_theme->text_font() && lvgl_theme->text_font()->font())
        ? lvgl_theme->text_font()->font()
        : &BUILTIN_TEXT_FONT;

    title_ = lv_label_create(screen_);
    lv_obj_set_width(title_, LV_PCT(100));
    lv_label_set_long_mode(title_, LV_LABEL_LONG_WRAP);
    lv_obj_align(title_, LV_ALIGN_TOP_LEFT, 0, 0);
    lv_obj_set_style_text_font(title_, font, 0);
    lv_obj_set_style_text_color(title_, lv_color_black(), 0);
    lv_label_set_text(title_, "");

    image_box_ = lv_obj_create(screen_);
    lv_obj_set_size(image_box_, kPageWidth - kPad * 2, kPageHeight - kPad * 2 - kTitleH);
    lv_obj_align(image_box_, LV_ALIGN_BOTTOM_LEFT, 0, 0);
    lv_obj_set_style_border_width(image_box_, 1, 0);
    lv_obj_set_style_border_color(image_box_, lv_color_black(), 0);
    lv_obj_set_style_bg_opa(image_box_, LV_OPA_TRANSP, 0);
    lv_obj_set_style_pad_all(image_box_, 0, 0);

    built_ = true;
}

lv_obj_t* MemePageAdapter::Screen() const {
    return screen_;
}

void MemePageAdapter::OnShow() {
    active_ = true;
    if (title_ != nullptr) {
        lv_label_set_text(title_, title_text_.c_str());
    }
    RenderIfPossible();
}

void MemePageAdapter::OnHide() {
    active_ = false;
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

void MemePageAdapter::Update(const std::string& title, std::vector<uint8_t> png_bytes) {
    title_text_ = title;
    png_bytes_ = std::move(png_bytes);
    if (title_ != nullptr) {
        lv_label_set_text(title_, title_text_.c_str());
    }
    RenderIfPossible();
}

void MemePageAdapter::RenderIfPossible() {
    if (!active_ || host_ == nullptr || image_box_ == nullptr) {
        return;
    }
    if (host_->GetActivePageId() != UiPageId::Meme) {
        return;
    }
    if (host_ != nullptr && pic_active_ && pic_w_ > 0 && pic_h_ > 0) {
        host_->UpdatePicRegion(pic_x_, pic_y_, pic_w_, pic_h_, nullptr, 0);
        pic_active_ = false;
    }
    if (png_bytes_.empty()) {
        host_->RequestUrgentFullRefresh();
        return;
    }

    lv_area_t a{};
    lv_obj_get_coords(image_box_, &a);
    pic_x_ = a.x1;
    pic_y_ = a.y1;
    pic_w_ = a.x2 - a.x1 + 1;
    pic_h_ = a.y2 - a.y1 + 1;
    if (pic_w_ <= 0 || pic_h_ <= 0) {
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
    const bool ok = PngleFeedAll(p, png_bytes_.data(), png_bytes_.size());
    pngle_destroy(p);
    if (!ok || !ctx.ok || pic_bin_.empty()) {
        std::vector<uint8_t>().swap(pic_bin_);
        host_->RequestUrgentFullRefresh();
        return;
    }

    host_->UpdatePicRegion(pic_x_, pic_y_, pic_w_, pic_h_, pic_bin_.data(), pic_bin_.size());
    host_->RequestUrgentFullRefresh();
    pic_active_ = true;
}

