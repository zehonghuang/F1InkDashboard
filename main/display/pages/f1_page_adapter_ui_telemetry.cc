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
    {
        const lv_coord_t inner_w = kPageWidth - 8;
        telemetry_title_ = CreateCellLabel(race_sessions_telemetry_body_, 0, 0, inner_w, "SPD(km/h)", font, LV_TEXT_ALIGN_LEFT, LV_LABEL_LONG_CLIP);
        lv_obj_set_style_pad_left(telemetry_title_, 2, 0);

        lv_obj_t* graph_box = lv_obj_create(race_sessions_telemetry_body_);
        lv_obj_set_size(graph_box, inner_w, 128);
        lv_obj_align(graph_box, LV_ALIGN_TOP_LEFT, 0, kRowH + 2);
        lv_obj_set_style_border_width(graph_box, 1, 0);
        lv_obj_set_style_border_color(graph_box, lv_color_black(), 0);
        lv_obj_set_style_bg_opa(graph_box, LV_OPA_TRANSP, 0);
        lv_obj_set_style_pad_all(graph_box, 4, 0);

        telemetry_graph_ = lv_label_create(graph_box);
        lv_obj_set_style_text_font(telemetry_graph_, font, 0);
        lv_label_set_long_mode(telemetry_graph_, LV_LABEL_LONG_WRAP);
        lv_obj_set_width(telemetry_graph_, LV_PCT(100));
        lv_obj_align(telemetry_graph_, LV_ALIGN_TOP_LEFT, 0, 0);
        lv_label_set_text(telemetry_graph_, "340 | \n280 | \n200 | \n120 | ");

        CreateCellLabel(
            race_sessions_telemetry_body_,
            0,
            kRowH + 2 + 128 + 2,
            inner_w,
            "S1           | S2           | S3",
            font,
            LV_TEXT_ALIGN_LEFT,
            LV_LABEL_LONG_CLIP);

        constexpr lv_coord_t kLabelW = 88;
        constexpr lv_coord_t kValueW = 44;
        const lv_coord_t bar_w = inner_w - kLabelW - kValueW - 8;
        const lv_coord_t base_y = kRowH + 2 + 128 + 2 + kRowH + 6;

        CreateCellLabel(race_sessions_telemetry_body_, 0, base_y, kLabelW, "THROTTLE", font, LV_TEXT_ALIGN_LEFT, LV_LABEL_LONG_CLIP);
        telemetry_throttle_bar_ = lv_bar_create(race_sessions_telemetry_body_);
        lv_obj_set_size(telemetry_throttle_bar_, bar_w, kRowH - 4);
        lv_obj_align(telemetry_throttle_bar_, LV_ALIGN_TOP_LEFT, kLabelW, base_y + 2);
        lv_bar_set_range(telemetry_throttle_bar_, 0, 100);
        lv_bar_set_value(telemetry_throttle_bar_, 0, LV_ANIM_OFF);
        lv_obj_set_style_border_width(telemetry_throttle_bar_, 1, 0);
        lv_obj_set_style_border_color(telemetry_throttle_bar_, lv_color_black(), 0);
        lv_obj_set_style_bg_opa(telemetry_throttle_bar_, LV_OPA_TRANSP, 0);

        telemetry_throttle_value_ = CreateCellLabel(
            race_sessions_telemetry_body_,
            kLabelW + bar_w + 4,
            base_y,
            kValueW,
            "--%",
            font,
            LV_TEXT_ALIGN_RIGHT,
            LV_LABEL_LONG_CLIP);
        lv_obj_set_style_pad_right(telemetry_throttle_value_, 2, 0);

        CreateCellLabel(race_sessions_telemetry_body_, 0, base_y + kRowH, kLabelW, "BRAKE", font, LV_TEXT_ALIGN_LEFT, LV_LABEL_LONG_CLIP);
        telemetry_brake_bar_ = lv_bar_create(race_sessions_telemetry_body_);
        lv_obj_set_size(telemetry_brake_bar_, bar_w, kRowH - 4);
        lv_obj_align(telemetry_brake_bar_, LV_ALIGN_TOP_LEFT, kLabelW, base_y + kRowH + 2);
        lv_bar_set_range(telemetry_brake_bar_, 0, 100);
        lv_bar_set_value(telemetry_brake_bar_, 0, LV_ANIM_OFF);
        lv_obj_set_style_border_width(telemetry_brake_bar_, 1, 0);
        lv_obj_set_style_border_color(telemetry_brake_bar_, lv_color_black(), 0);
        lv_obj_set_style_bg_opa(telemetry_brake_bar_, LV_OPA_TRANSP, 0);

        telemetry_brake_value_ = CreateCellLabel(
            race_sessions_telemetry_body_,
            kLabelW + bar_w + 4,
            base_y + kRowH,
            kValueW,
            "--%",
            font,
            LV_TEXT_ALIGN_RIGHT,
            LV_LABEL_LONG_CLIP);
        lv_obj_set_style_pad_right(telemetry_brake_value_, 2, 0);

        telemetry_no_data_ = lv_label_create(race_sessions_telemetry_body_);
        lv_obj_set_style_text_font(telemetry_no_data_, font, 0);
        lv_label_set_long_mode(telemetry_no_data_, LV_LABEL_LONG_WRAP);
        lv_obj_set_width(telemetry_no_data_, LV_PCT(100));
        lv_obj_set_style_text_align(telemetry_no_data_, LV_TEXT_ALIGN_CENTER, 0);
        lv_obj_align(telemetry_no_data_, LV_ALIGN_CENTER, 0, 12);
        lv_label_set_text(telemetry_no_data_, "NO TELEMETRY");
        lv_obj_add_flag(telemetry_no_data_, LV_OBJ_FLAG_HIDDEN);
    }
}

