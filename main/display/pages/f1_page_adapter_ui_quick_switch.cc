#include "pages/f1_page_adapter.h"

#include "lcd_display.h"
#include "lvgl_theme.h"
#include "pages/f1_page_adapter_common.h"

using namespace f1_page_internal;

void F1PageAdapter::BuildQuickSwitchLocked() {
    auto* lvgl_theme = static_cast<LvglTheme*>(host_->current_theme_);
    const lv_font_t* cn_font = lvgl_theme && lvgl_theme->text_font() ? lvgl_theme->text_font()->font() : nullptr;
    const lv_font_t* small_font = &lv_font_montserrat_14;
    const lv_font_t* font = cn_font ? cn_font : small_font;

    lv_obj_set_size(quick_switch_root_, kPageWidth, kPageHeight);
    lv_obj_align(quick_switch_root_, LV_ALIGN_TOP_LEFT, 0, 0);
    lv_obj_set_style_bg_opa(quick_switch_root_, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(quick_switch_root_, 0, 0);
    lv_obj_set_style_pad_all(quick_switch_root_, 0, 0);

    quick_switch_box_ = lv_obj_create(quick_switch_root_);
    StyleBox(quick_switch_box_);
    lv_obj_set_size(quick_switch_box_, 280, 210);
    lv_obj_align(quick_switch_box_, LV_ALIGN_CENTER, 0, 0);
    lv_obj_set_style_pad_all(quick_switch_box_, 8, 0);
    lv_obj_set_style_pad_row(quick_switch_box_, 6, 0);
    lv_obj_set_layout(quick_switch_box_, LV_LAYOUT_FLEX);
    lv_obj_set_flex_flow(quick_switch_box_, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_flex_align(quick_switch_box_, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);

    quick_switch_title_ = lv_label_create(quick_switch_box_);
    lv_obj_set_style_text_font(quick_switch_title_, font, 0);
    lv_label_set_long_mode(quick_switch_title_, LV_LABEL_LONG_CLIP);
    lv_obj_set_width(quick_switch_title_, LV_PCT(100));
    lv_label_set_text(quick_switch_title_, "[ QUICK SWITCH ]");

    lv_obj_t* body = lv_obj_create(quick_switch_box_);
    lv_obj_set_width(body, LV_PCT(100));
    lv_obj_set_style_bg_opa(body, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(body, 0, 0);
    lv_obj_set_style_pad_all(body, 0, 0);
    lv_obj_set_style_pad_row(body, 6, 0);
    lv_obj_set_layout(body, LV_LAYOUT_FLEX);
    lv_obj_set_flex_flow(body, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_flex_align(body, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);

    struct RowText {
        const char* label;
    };
    const RowText rows[kQuickSwitchItems] = {
        {"[ RACE WEEK ]"},
        {"[ OFF WEEK ]"},
        {"[ DRIVER STANDINGS ]"},
        {"[ CONSTRUCTOR STANDINGS ]"},
        {"[ CIRCUIT ]"},
        {"[ RACE SESSIONS ]"},
    };

    constexpr lv_coord_t row_h = 22;
    for (int i = 0; i < kQuickSwitchItems; i++) {
        lv_obj_t* box = lv_obj_create(body);
        quick_switch_item_boxes_[static_cast<size_t>(i)] = box;
        lv_obj_set_size(box, LV_PCT(100), row_h);
        lv_obj_set_style_bg_opa(box, LV_OPA_TRANSP, 0);
        lv_obj_set_style_border_width(box, 1, 0);
        lv_obj_set_style_border_color(box, lv_color_black(), 0);
        lv_obj_set_style_pad_left(box, 6, 0);
        lv_obj_set_style_pad_right(box, 6, 0);
        lv_obj_set_style_pad_top(box, 2, 0);
        lv_obj_set_style_pad_bottom(box, 2, 0);

        lv_obj_t* l = lv_label_create(box);
        quick_switch_item_labels_[static_cast<size_t>(i)] = l;
        lv_obj_set_style_text_font(l, font, 0);
        lv_label_set_long_mode(l, LV_LABEL_LONG_CLIP);
        lv_obj_align(l, LV_ALIGN_LEFT_MID, 0, 0);
        lv_label_set_text(l, rows[i].label);
    }

    quick_switch_footer_ = lv_label_create(quick_switch_box_);
    lv_obj_set_style_text_font(quick_switch_footer_, font, 0);
    lv_label_set_long_mode(quick_switch_footer_, LV_LABEL_LONG_CLIP);
    lv_obj_set_width(quick_switch_footer_, LV_PCT(100));
    lv_label_set_text(quick_switch_footer_, "[UP/DN] SELECT  | [CONFIRM] ENTER  | [L-CONFIRM] CLOSE");

    ApplyQuickSwitchSelectionLocked();
}

void F1PageAdapter::ApplyQuickSwitchSelectionLocked() {
    if (quick_switch_focus_ < 0) {
        quick_switch_focus_ = 0;
    }
    if (quick_switch_focus_ >= kQuickSwitchItems) {
        quick_switch_focus_ %= kQuickSwitchItems;
    }
    for (int i = 0; i < kQuickSwitchItems; i++) {
        lv_obj_t* box = quick_switch_item_boxes_[static_cast<size_t>(i)];
        if (box == nullptr) {
            continue;
        }
        const bool sel = i == quick_switch_focus_;
        lv_obj_set_style_border_width(box, sel ? 4 : 1, 0);
        lv_obj_set_style_border_color(box, lv_color_black(), 0);
    }
}

void F1PageAdapter::ActivateQuickSwitchTargetLocked(int target_index) {
    if (target_index < 0 || target_index >= kQuickSwitchItems) {
        return;
    }
    if (target_index == 0) {
        nav_.SetRoot(NavNode::RaceRoot);
        return;
    }
    if (target_index == 1) {
        nav_.SetRoot(NavNode::OffRoot);
        return;
    }

    NavNode root = NavNode::RaceRoot;
    int physical = 0;
    if (target_index == 2) {
        root = NavNode::OffRoot;
        physical = 0;
    } else if (target_index == 3) {
        root = NavNode::OffRoot;
        physical = 2;
    } else if (target_index == 4) {
        root = nav_.Root();
        physical = 1;
    } else if (target_index == 5) {
        root = NavNode::RaceRoot;
        physical = 2;
    } else {
        return;
    }

    static constexpr std::array<int, 4> kRaceSeq = {1, 0, 3, 2};
    static constexpr std::array<int, 4> kOffSeq = {0, 1, 3, 2};
    const auto& seq = root == NavNode::RaceRoot ? kRaceSeq : kOffSeq;
    int focus = 0;
    for (int i = 0; i < 4; i++) {
        if (seq[static_cast<size_t>(i)] == physical) {
            focus = i;
            break;
        }
    }

    UiNavSetRootFocus(root, focus);
    nav_.SetRoot(root);
    nav_.Enter();
}
