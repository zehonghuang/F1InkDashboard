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
    lv_obj_clear_flag(quick_switch_root_, LV_OBJ_FLAG_SCROLLABLE);

    quick_switch_box_ = lv_obj_create(quick_switch_root_);
    StyleBox(quick_switch_box_);
    constexpr lv_coord_t box_w = 230;
    constexpr lv_coord_t box_h = 165;
    lv_obj_set_size(quick_switch_box_, box_w, box_h);
    lv_obj_align(quick_switch_box_, LV_ALIGN_CENTER, 0, 0);
    lv_obj_set_style_pad_all(quick_switch_box_, 0, 0);
    lv_obj_clear_flag(quick_switch_box_, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_add_flag(quick_switch_box_, LV_OBJ_FLAG_OVERFLOW_VISIBLE);

    constexpr lv_coord_t footer_h = 42;
    lv_obj_t* footer_box = lv_obj_create(quick_switch_box_);
    lv_obj_set_size(footer_box, LV_PCT(100), footer_h);
    lv_obj_align(footer_box, LV_ALIGN_BOTTOM_LEFT, 0, 0);
    lv_obj_set_style_bg_opa(footer_box, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(footer_box, 1, 0);
    lv_obj_set_style_border_side(footer_box, LV_BORDER_SIDE_TOP, 0);
    lv_obj_set_style_border_color(footer_box, lv_color_black(), 0);
    lv_obj_set_style_pad_left(footer_box, 4, 0);
    lv_obj_set_style_pad_right(footer_box, 4, 0);
    lv_obj_set_style_pad_top(footer_box, 2, 0);
    lv_obj_set_style_pad_bottom(footer_box, 2, 0);
    lv_obj_clear_flag(footer_box, LV_OBJ_FLAG_SCROLLABLE);

    quick_switch_body_ = lv_obj_create(quick_switch_box_);
    lv_obj_set_size(quick_switch_body_, LV_PCT(100), box_h - footer_h);
    lv_obj_align(quick_switch_body_, LV_ALIGN_TOP_LEFT, 0, 0);
    lv_obj_set_style_bg_opa(quick_switch_body_, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(quick_switch_body_, 0, 0);
    lv_obj_set_style_pad_all(quick_switch_body_, 4, 0);
    lv_obj_set_style_pad_row(quick_switch_body_, 2, 0);
    lv_obj_set_layout(quick_switch_body_, LV_LAYOUT_FLEX);
    lv_obj_set_flex_flow(quick_switch_body_, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_flex_align(quick_switch_body_, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
    lv_obj_set_scroll_dir(quick_switch_body_, LV_DIR_VER);
    lv_obj_set_scrollbar_mode(quick_switch_body_, LV_SCROLLBAR_MODE_ACTIVE);
    lv_obj_clear_flag(quick_switch_body_, LV_OBJ_FLAG_OVERFLOW_VISIBLE);
    lv_obj_clear_flag(quick_switch_box_, LV_OBJ_FLAG_OVERFLOW_VISIBLE);

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

    constexpr lv_coord_t row_h = 18;
    for (int i = 0; i < kQuickSwitchItems; i++) {
        lv_obj_t* box = lv_obj_create(quick_switch_body_);
        quick_switch_item_boxes_[static_cast<size_t>(i)] = box;
        lv_obj_set_size(box, LV_PCT(100), row_h);
        lv_obj_set_style_bg_opa(box, LV_OPA_TRANSP, 0);
        lv_obj_set_style_border_width(box, 1, 0);
        lv_obj_set_style_border_color(box, lv_color_black(), 0);
        lv_obj_set_style_pad_left(box, 4, 0);
        lv_obj_set_style_pad_right(box, 4, 0);
        lv_obj_set_style_pad_top(box, 1, 0);
        lv_obj_set_style_pad_bottom(box, 1, 0);
        lv_obj_clear_flag(box, LV_OBJ_FLAG_SCROLLABLE);

        lv_obj_t* l = lv_label_create(box);
        quick_switch_item_labels_[static_cast<size_t>(i)] = l;
        lv_obj_set_style_text_font(l, font, 0);
        lv_label_set_long_mode(l, LV_LABEL_LONG_CLIP);
        lv_obj_align(l, LV_ALIGN_LEFT_MID, 0, 0);
        lv_label_set_text(l, rows[i].label);
    }

    quick_switch_footer_ = lv_label_create(footer_box);
    lv_obj_set_style_text_font(quick_switch_footer_, font, 0);
    lv_label_set_long_mode(quick_switch_footer_, LV_LABEL_LONG_WRAP);
    lv_obj_set_width(quick_switch_footer_, LV_PCT(100));
    lv_obj_set_style_text_align(quick_switch_footer_, LV_TEXT_ALIGN_LEFT, 0);
    lv_label_set_text(quick_switch_footer_, "[UP/DN] SELECT\n[CONFIRM] ENTER | [L-CONFIRM] CLOSE");
    lv_obj_align(quick_switch_footer_, LV_ALIGN_TOP_LEFT, 0, 0);
    lv_obj_move_foreground(footer_box);

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
        lv_obj_t* label = quick_switch_item_labels_[static_cast<size_t>(i)];
        if (box == nullptr || label == nullptr) {
            continue;
        }
        const bool sel = i == quick_switch_focus_;
        lv_obj_set_style_border_width(box, 1, 0);
        lv_obj_set_style_border_color(box, lv_color_black(), 0);
        if (sel) {
            lv_obj_set_style_bg_color(box, lv_color_black(), 0);
            lv_obj_set_style_bg_opa(box, LV_OPA_COVER, 0);
            lv_obj_set_style_text_color(label, lv_color_white(), 0);
        } else {
            lv_obj_set_style_bg_opa(box, LV_OPA_TRANSP, 0);
            lv_obj_set_style_text_color(label, lv_color_black(), 0);
        }
    }
    if (quick_switch_body_ != nullptr) {
        lv_obj_t* sel_box = quick_switch_item_boxes_[static_cast<size_t>(quick_switch_focus_)];
        if (sel_box != nullptr) {
            lv_obj_scroll_to_view(sel_box, LV_ANIM_OFF);
        }
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
