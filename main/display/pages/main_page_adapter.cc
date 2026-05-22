#include "pages/main_page_adapter.h"

#include "lcd_display.h"

#include <lvgl.h>

namespace {

constexpr lv_coord_t kPageWidth = 400;
constexpr lv_coord_t kPageHeight = 300;

}  // namespace

MainPageAdapter::MainPageAdapter(LcdDisplay* host) : host_(host) {}

UiPageId MainPageAdapter::Id() const {
    return UiPageId::Home;
}

const char* MainPageAdapter::Name() const {
    return "Main";
}

void MainPageAdapter::Build() {
    if (built_) {
        return;
    }
    built_ = true;

    screen_ = lv_obj_create(nullptr);
    lv_obj_set_size(screen_, kPageWidth, kPageHeight);
    lv_obj_clear_flag(screen_, LV_OBJ_FLAG_SCROLLABLE);

    title_label_ = lv_label_create(screen_);
    lv_label_set_text(title_label_, "Base Firmware");
    lv_obj_align(title_label_, LV_ALIGN_TOP_MID, 0, 28);

    hint_label_ = lv_label_create(screen_);
    lv_label_set_text(hint_label_, "Business pages removed");
    lv_obj_align(hint_label_, LV_ALIGN_TOP_MID, 0, 78);
}

lv_obj_t* MainPageAdapter::Screen() const {
    return screen_;
}

void MainPageAdapter::OnShow() {}

bool MainPageAdapter::HandleEvent(const UiPageEvent& event) {
    if (host_ == nullptr) {
        return false;
    }
    if (event.type != UiPageEventType::Custom) {
        return false;
    }
    const auto id = static_cast<UiPageCustomEventId>(event.i32);
    if (id == UiPageCustomEventId::MenuShow) {
        host_->ShowMenuOverlay("Menu", {"Item A", "Item B", "Item C"}, 0);
        host_->RequestUrgentFullRefresh();
        return true;
    }
    return false;
}
