#include "pages/breaking_news_page_adapter.h"

#include "lcd_display.h"
#include "lvgl_theme.h"

#include <font_zectrix.h>

LV_FONT_DECLARE(BUILTIN_TEXT_FONT);

namespace {

constexpr lv_coord_t kPageWidth = 400;
constexpr lv_coord_t kPageHeight = 300;

void StyleScreen(lv_obj_t* obj) {
    if (obj == nullptr) {
        return;
    }
    lv_obj_set_size(obj, kPageWidth, kPageHeight);
    lv_obj_set_style_bg_color(obj, lv_color_white(), 0);
    lv_obj_set_style_bg_opa(obj, LV_OPA_COVER, 0);
    lv_obj_set_style_pad_all(obj, 12, 0);
    lv_obj_set_style_border_width(obj, 0, 0);
}

}  // namespace

BreakingNewsPageAdapter::BreakingNewsPageAdapter(LcdDisplay* host) : host_(host) {
}

UiPageId BreakingNewsPageAdapter::Id() const {
    return UiPageId::BreakingNews;
}

const char* BreakingNewsPageAdapter::Name() const {
    return "BreakingNews";
}

void BreakingNewsPageAdapter::Build() {
    if (built_ || host_ == nullptr) {
        built_ = true;
        return;
    }
    if (host_->breaking_news_screen_ != nullptr) {
        screen_ = host_->breaking_news_screen_;
        built_ = true;
        return;
    }
    screen_ = lv_obj_create(nullptr);
    host_->breaking_news_screen_ = screen_;
    StyleScreen(screen_);

    auto* lvgl_theme = static_cast<LvglTheme*>(host_->current_theme_);
    const lv_font_t* font = (lvgl_theme && lvgl_theme->text_font() && lvgl_theme->text_font()->font())
        ? lvgl_theme->text_font()->font()
        : &BUILTIN_TEXT_FONT;

    label_ = lv_label_create(screen_);
    lv_obj_set_width(label_, LV_PCT(100));
    lv_label_set_long_mode(label_, LV_LABEL_LONG_WRAP);
    lv_obj_align(label_, LV_ALIGN_CENTER, 0, 0);
    lv_obj_set_style_text_font(label_, font, 0);
    lv_obj_set_style_text_color(label_, lv_color_black(), 0);
    lv_label_set_text(label_, "");

    built_ = true;
}

lv_obj_t* BreakingNewsPageAdapter::Screen() const {
    return screen_;
}

void BreakingNewsPageAdapter::OnShow() {
    if (label_ != nullptr) {
        lv_label_set_text(label_, text_.c_str());
    }
}

void BreakingNewsPageAdapter::UpdateText(const std::string& text) {
    text_ = text;
    if (label_ != nullptr) {
        lv_label_set_text(label_, text_.c_str());
    }
}
