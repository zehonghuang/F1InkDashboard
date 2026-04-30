#include "pages/f1_page_adapter.h"

#include "lcd_display.h"
#include "lvgl_theme.h"
#include "pages/f1_page_adapter_common.h"

using namespace f1_page_internal;

void F1PageAdapter::BuildMenuLocked() {
    auto* lvgl_theme = static_cast<LvglTheme*>(host_->current_theme_);
    const lv_font_t* cn_font = lvgl_theme && lvgl_theme->text_font() ? lvgl_theme->text_font()->font() : nullptr;
    const lv_font_t* small_font = &lv_font_montserrat_14;
    const lv_font_t* font = cn_font ? cn_font : small_font;

    lv_obj_set_size(menu_root_, kPageWidth, kPageHeight);
    lv_obj_align(menu_root_, LV_ALIGN_TOP_LEFT, 0, 0);
    lv_obj_set_style_bg_color(menu_root_, lv_color_white(), 0);
    lv_obj_set_style_bg_opa(menu_root_, LV_OPA_COVER, 0);
    lv_obj_set_style_border_width(menu_root_, 0, 0);
    lv_obj_set_style_pad_all(menu_root_, 0, 0);

    lv_obj_t* header = lv_obj_create(menu_root_);
    lv_obj_set_size(header, kPageWidth, kHeaderH);
    lv_obj_align(header, LV_ALIGN_TOP_LEFT, 0, 0);
    lv_obj_set_style_bg_opa(header, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(header, 1, 0);
    lv_obj_set_style_border_side(header, LV_BORDER_SIDE_BOTTOM, 0);
    lv_obj_set_style_border_color(header, lv_color_black(), 0);
    lv_obj_set_style_pad_left(header, 8, 0);
    lv_obj_set_style_pad_right(header, 8, 0);
    lv_obj_set_style_pad_top(header, 4, 0);
    lv_obj_set_style_pad_bottom(header, 4, 0);

    menu_header_left_ = lv_label_create(header);
    lv_obj_set_style_text_font(menu_header_left_, font, 0);
    lv_label_set_long_mode(menu_header_left_, LV_LABEL_LONG_CLIP);
    lv_obj_align(menu_header_left_, LV_ALIGN_LEFT_MID, 0, 0);
    lv_label_set_text(menu_header_left_, "[ MENU ]  SYSTEM CONFIGURATION");

    menu_header_right_ = lv_label_create(header);
    lv_obj_set_style_text_font(menu_header_right_, font, 0);
    lv_label_set_long_mode(menu_header_right_, LV_LABEL_LONG_CLIP);
    lv_obj_align(menu_header_right_, LV_ALIGN_RIGHT_MID, 0, 0);
    lv_label_set_text(menu_header_right_, "22:59 [|||]");

    const lv_coord_t footer_h = 22;
    lv_obj_t* footer = lv_obj_create(menu_root_);
    lv_obj_set_size(footer, kPageWidth, footer_h);
    lv_obj_align(footer, LV_ALIGN_BOTTOM_LEFT, 0, 0);
    lv_obj_set_style_bg_opa(footer, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(footer, 1, 0);
    lv_obj_set_style_border_side(footer, LV_BORDER_SIDE_TOP, 0);
    lv_obj_set_style_border_color(footer, lv_color_black(), 0);
    lv_obj_set_style_pad_left(footer, 8, 0);
    lv_obj_set_style_pad_right(footer, 8, 0);
    lv_obj_set_style_pad_top(footer, 2, 0);
    lv_obj_set_style_pad_bottom(footer, 2, 0);

    menu_footer_ = lv_label_create(footer);
    lv_obj_set_style_text_font(menu_footer_, font, 0);
    lv_label_set_long_mode(menu_footer_, LV_LABEL_LONG_CLIP);
    lv_obj_set_width(menu_footer_, LV_PCT(100));
    lv_obj_align(menu_footer_, LV_ALIGN_LEFT_MID, 0, 0);
    lv_label_set_text(menu_footer_, "[UP/DN] SELECT  | [CONFIRM] ENTER  | [L-CONFIRM] HOME");

    lv_obj_t* body = lv_obj_create(menu_root_);
    lv_obj_set_size(body, kPageWidth, kPageHeight - kHeaderH - footer_h);
    lv_obj_align(body, LV_ALIGN_TOP_LEFT, 0, kHeaderH);
    lv_obj_set_style_bg_opa(body, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(body, 0, 0);
    lv_obj_set_style_pad_left(body, 8, 0);
    lv_obj_set_style_pad_right(body, 8, 0);
    lv_obj_set_style_pad_top(body, 6, 0);
    lv_obj_set_style_pad_bottom(body, 6, 0);

    struct RowText {
        const char* left;
        const char* right;
    };
    const RowText rows[] = {
        {"[ PAST RACES      ]", "View 2025/26 Season Results"},
        {"[ FULL CALENDAR   ]", "2026 Race Schedule"},
        {"[ DATA REFRESH    ]", "Force API Sync (4G/WiFi)"},
        {"[ SYSTEM SETTINGS ]", "WiFi, Screen, Sleep Timer"},
        {"[ BATTERY STATS   ]", "Health: --% / --.--V"},
        {"[ ABOUT DEVICE    ]", "Tonic F1 Dash v1.0.4"},
        {"[ REBOOT          ]", "Restart device"},
    };

    constexpr lv_coord_t row_h = 22;
    for (int i = 0; i < static_cast<int>(menu_item_boxes_.size()); i++) {
        lv_obj_t* box = lv_obj_create(body);
        menu_item_boxes_[static_cast<size_t>(i)] = box;
        lv_obj_set_size(box, kPageWidth - 16, row_h);
        lv_obj_align(box, LV_ALIGN_TOP_LEFT, 0, i * row_h);
        lv_obj_set_style_bg_opa(box, LV_OPA_TRANSP, 0);
        lv_obj_set_style_border_width(box, 1, 0);
        lv_obj_set_style_border_color(box, lv_color_black(), 0);
        lv_obj_set_style_pad_left(box, 6, 0);
        lv_obj_set_style_pad_right(box, 6, 0);
        lv_obj_set_style_pad_top(box, 2, 0);
        lv_obj_set_style_pad_bottom(box, 2, 0);

        lv_obj_t* l = lv_label_create(box);
        menu_item_left_[static_cast<size_t>(i)] = l;
        lv_obj_set_style_text_font(l, font, 0);
        lv_label_set_long_mode(l, LV_LABEL_LONG_CLIP);
        lv_obj_align(l, LV_ALIGN_LEFT_MID, 0, 0);
        lv_label_set_text(l, rows[i].left);

        lv_obj_t* r = lv_label_create(box);
        menu_item_right_[static_cast<size_t>(i)] = r;
        lv_obj_set_style_text_font(r, font, 0);
        lv_label_set_long_mode(r, LV_LABEL_LONG_CLIP);
        lv_obj_align(r, LV_ALIGN_RIGHT_MID, 0, 0);
        lv_label_set_text(r, rows[i].right);
    }

    ApplyMenuSelectionLocked();
}

void F1PageAdapter::ApplyMenuSelectionLocked() {
    for (int i = 0; i < static_cast<int>(menu_item_boxes_.size()); i++) {
        lv_obj_t* box = menu_item_boxes_[static_cast<size_t>(i)];
        if (box == nullptr) {
            continue;
        }
        const bool sel = i == menu_focus_;
        lv_obj_set_style_border_width(box, sel ? 4 : 1, 0);
        lv_obj_set_style_border_color(box, lv_color_black(), 0);
    }
}
