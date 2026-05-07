#include "pages/f1_page_adapter.h"

#include "lcd_display.h"
#include "lvgl_theme.h"
#include "pages/f1_page_adapter_common.h"

#include <font_zectrix.h>

using namespace f1_page_internal;

void F1PageAdapter::BuildTelemetryLocked() {
    auto* lvgl_theme = static_cast<LvglTheme*>(host_->current_theme_);
    const lv_font_t* cn_font = lvgl_theme && lvgl_theme->text_font() ? lvgl_theme->text_font()->font() : nullptr;
    const lv_font_t* small_font = &lv_font_montserrat_14;
    const lv_font_t* font = cn_font ? cn_font : small_font;

    constexpr lv_coord_t bottom_h = 24;
    const lv_coord_t body_h = kPageHeight - kHeaderH - bottom_h;

    race_sessions_telemetry_body_ = lv_obj_create(race_sessions_root_);
    StyleBox(race_sessions_telemetry_body_);
    lv_obj_set_size(race_sessions_telemetry_body_, kPageWidth, body_h);
    lv_obj_align(race_sessions_telemetry_body_, LV_ALIGN_TOP_LEFT, 0, kHeaderH);
    lv_obj_set_style_border_side(race_sessions_telemetry_body_, LV_BORDER_SIDE_BOTTOM, 0);
    lv_obj_clear_flag(race_sessions_telemetry_body_, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_scrollbar_mode(race_sessions_telemetry_body_, LV_SCROLLBAR_MODE_OFF);
    {
        const lv_coord_t inner_w = kPageWidth - 8;

        telemetry_title_ = CreateCellLabel(race_sessions_telemetry_body_, 0, 0, inner_w, "", font, LV_TEXT_ALIGN_LEFT, LV_LABEL_LONG_CLIP);
        lv_obj_set_style_pad_left(telemetry_title_, 2, 0);
        lv_obj_set_height(telemetry_title_, 0);
        lv_obj_add_flag(telemetry_title_, LV_OBJ_FLAG_HIDDEN);

        lv_obj_t* box = lv_obj_create(race_sessions_telemetry_body_);
        lv_obj_set_size(box, inner_w, body_h - kRowH * 2);
        lv_obj_align(box, LV_ALIGN_TOP_LEFT, 0, 0);
        lv_obj_set_style_border_width(box, 0, 0);
        lv_obj_set_style_bg_opa(box, LV_OPA_TRANSP, 0);
        lv_obj_set_style_pad_all(box, 0, 0);
        lv_obj_clear_flag(box, LV_OBJ_FLAG_SCROLLABLE);
        lv_obj_set_scrollbar_mode(box, LV_SCROLLBAR_MODE_OFF);

        telemetry_graph_ = lv_label_create(box);
        lv_obj_set_style_text_font(telemetry_graph_, font, 0);
        lv_label_set_long_mode(telemetry_graph_, LV_LABEL_LONG_WRAP);
        lv_obj_set_width(telemetry_graph_, LV_PCT(100));
        lv_obj_align(telemetry_graph_, LV_ALIGN_TOP_LEFT, 0, 0);
        lv_label_set_text(telemetry_graph_, "LOADING...");

        telemetry_meta_ = CreateCellLabel(
            race_sessions_telemetry_body_,
            0,
            body_h - kRowH * 2,
            inner_w,
            "",
            font,
            LV_TEXT_ALIGN_LEFT,
            LV_LABEL_LONG_WRAP);
        lv_obj_set_size(telemetry_meta_, inner_w, kRowH * 2);
        lv_obj_set_style_pad_left(telemetry_meta_, 2, 0);

        telemetry_no_data_ = lv_label_create(race_sessions_telemetry_body_);
        lv_obj_set_style_text_font(telemetry_no_data_, font, 0);
        lv_label_set_long_mode(telemetry_no_data_, LV_LABEL_LONG_WRAP);
        lv_obj_set_width(telemetry_no_data_, LV_PCT(100));
        lv_obj_set_style_text_align(telemetry_no_data_, LV_TEXT_ALIGN_CENTER, 0);
        lv_obj_align(telemetry_no_data_, LV_ALIGN_CENTER, 0, 12);
        lv_label_set_text(telemetry_no_data_, "NO TELEMETRY");
        lv_obj_add_flag(telemetry_no_data_, LV_OBJ_FLAG_HIDDEN);

        telemetry_throttle_bar_ = nullptr;
        telemetry_throttle_value_ = nullptr;
        telemetry_brake_bar_ = nullptr;
        telemetry_brake_value_ = nullptr;
    }
}
