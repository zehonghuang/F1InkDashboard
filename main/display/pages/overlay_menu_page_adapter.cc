#include "pages/overlay_menu_page_adapter.h"

#include "lcd_display.h"
#include "lvgl_theme.h"

#include <font_zectrix.h>

LV_FONT_DECLARE(BUILTIN_TEXT_FONT);

namespace {

constexpr lv_coord_t kPageWidth = 400;
constexpr lv_coord_t kPageHeight = 300;

constexpr lv_coord_t kPad = 12;

void StyleScreen(lv_obj_t* obj) {
    if (obj == nullptr) {
        return;
    }
    lv_obj_set_size(obj, kPageWidth, kPageHeight);
    lv_obj_set_style_bg_color(obj, lv_color_white(), 0);
    lv_obj_set_style_bg_opa(obj, LV_OPA_COVER, 0);
    lv_obj_set_style_pad_all(obj, kPad, 0);
    lv_obj_set_style_border_width(obj, 0, 0);
}

std::string BuildListText(const std::vector<std::string>& items, int selected) {
    std::string out;
    for (size_t i = 0; i < items.size(); i++) {
        const bool is_sel = static_cast<int>(i) == selected;
        out += is_sel ? "> " : "  ";
        out += items[i];
        out += "\n";
    }
    return out;
}

}  // namespace

OverlayMenuPageAdapter::OverlayMenuPageAdapter(LcdDisplay* host) : host_(host) {}

UiPageId OverlayMenuPageAdapter::Id() const {
    return UiPageId::OverlayMenu;
}

const char* OverlayMenuPageAdapter::Name() const {
    return "OverlayMenu";
}

void OverlayMenuPageAdapter::Build() {
    if (built_ || host_ == nullptr) {
        built_ = true;
        return;
    }
    if (host_->overlay_menu_screen_ != nullptr) {
        screen_ = host_->overlay_menu_screen_;
        built_ = true;
        return;
    }

    screen_ = lv_obj_create(nullptr);
    host_->overlay_menu_screen_ = screen_;
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

    list_label_ = lv_label_create(screen_);
    lv_obj_set_width(list_label_, LV_PCT(100));
    lv_label_set_long_mode(list_label_, LV_LABEL_LONG_WRAP);
    lv_obj_align(list_label_, LV_ALIGN_TOP_LEFT, 0, 44);
    lv_obj_set_style_text_font(list_label_, font, 0);
    lv_obj_set_style_text_color(list_label_, lv_color_black(), 0);
    lv_label_set_text(list_label_, "");

    built_ = true;
}

lv_obj_t* OverlayMenuPageAdapter::Screen() const {
    return screen_;
}

void OverlayMenuPageAdapter::OnShow() {
    active_ = true;
    RenderLocked();
}

void OverlayMenuPageAdapter::OnHide() {
    active_ = false;
}

bool OverlayMenuPageAdapter::HandleEvent(const UiPageEvent& event) {
    if (!active_) {
        return false;
    }
    if (event.type != UiPageEventType::Custom) {
        return false;
    }
    const auto id = static_cast<UiPageCustomEventId>(event.i32);
    if (id == UiPageCustomEventId::PagePrev) {
        UpdateSelectionLocked(selected_ - 1);
        return true;
    }
    if (id == UiPageCustomEventId::PageNext) {
        UpdateSelectionLocked(selected_ + 1);
        return true;
    }
    if (id == UiPageCustomEventId::ConfirmClick) {
        if (selected_ >= 0 && selected_ < static_cast<int>(items_.size())) {
            if (on_select_) {
                on_select_(selected_, items_[static_cast<size_t>(selected_)]);
            }
        }
        if (host_ != nullptr) {
            (void)host_->Back();
        }
        return true;
    }
    return false;
}

void OverlayMenuPageAdapter::Update(const std::string& title, std::vector<std::string> items, int selected) {
    title_text_ = title;
    items_ = std::move(items);
    selected_ = selected;
    if (selected_ < 0) {
        selected_ = 0;
    }
    if (selected_ >= static_cast<int>(items_.size())) {
        selected_ = static_cast<int>(items_.empty() ? 0 : (items_.size() - 1));
    }
    RenderLocked();
}

void OverlayMenuPageAdapter::SetOnSelect(std::function<void(int index, const std::string& item)>&& cb) {
    on_select_ = std::move(cb);
}

void OverlayMenuPageAdapter::RenderLocked() {
    if (!active_) {
        return;
    }
    if (title_ != nullptr) {
        lv_label_set_text(title_, title_text_.c_str());
    }
    if (list_label_ != nullptr) {
        const std::string s = BuildListText(items_, selected_);
        lv_label_set_text(list_label_, s.c_str());
    }
}

void OverlayMenuPageAdapter::UpdateSelectionLocked(int next) {
    if (items_.empty()) {
        selected_ = 0;
        RenderLocked();
        return;
    }
    const int n = static_cast<int>(items_.size());
    if (next < 0) {
        next = n - 1;
    } else if (next >= n) {
        next = 0;
    }
    if (selected_ == next) {
        return;
    }
    selected_ = next;
    RenderLocked();
    if (host_ != nullptr) {
        host_->RequestUrgentFullRefresh();
    }
}

