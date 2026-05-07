#include "pages/f1_page_adapter.h"

#include "lcd_display.h"
#include "lvgl_theme.h"
#include "pages/f1_page_adapter_common.h"

#include <cstdio>
#include <string>

using namespace f1_page_internal;

void F1PageAdapter::BuildCircuitDetailLocked() {
    auto* lvgl_theme = static_cast<LvglTheme*>(host_->current_theme_);
    const lv_font_t* cn_font = lvgl_theme && lvgl_theme->text_font() ? lvgl_theme->text_font()->font() : nullptr;
    const lv_font_t* small_font = &lv_font_montserrat_14;
    const lv_font_t* font = cn_font ? cn_font : small_font;

    lv_obj_t* header = lv_obj_create(circuit_root_);
    lv_obj_set_size(header, kPageWidth, kHeaderH);
    lv_obj_align(header, LV_ALIGN_TOP_MID, 0, 0);
    lv_obj_set_style_bg_opa(header, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(header, 1, 0);
    lv_obj_set_style_border_side(header, LV_BORDER_SIDE_BOTTOM, 0);
    lv_obj_set_style_border_color(header, lv_color_black(), 0);
    lv_obj_set_style_pad_left(header, 8, 0);
    lv_obj_set_style_pad_right(header, 8, 0);
    lv_obj_set_style_pad_top(header, 4, 0);
    lv_obj_set_style_pad_bottom(header, 4, 0);

    circuit_header_left_ = lv_label_create(header);
    lv_obj_set_style_text_font(circuit_header_left_, font, 0);
    lv_obj_align(circuit_header_left_, LV_ALIGN_LEFT_MID, 0, 0);
    lv_label_set_text(circuit_header_left_, "[BACK]");

    circuit_header_center_ = lv_label_create(header);
    lv_obj_set_style_text_font(circuit_header_center_, font, 0);
    lv_obj_align(circuit_header_center_, LV_ALIGN_CENTER, 0, 0);
    lv_label_set_text(circuit_header_center_, "CIRCUIT");

    circuit_header_right_ = lv_label_create(header);
    lv_obj_set_style_text_font(circuit_header_right_, font, 0);
    lv_obj_align(circuit_header_right_, LV_ALIGN_RIGHT_MID, 0, 0);
    lv_label_set_text(circuit_header_right_, "PG 1/2");

    const lv_coord_t footer_h = lv_font_get_line_height(font) + 8;
    lv_obj_t* footer = lv_obj_create(circuit_root_);
    lv_obj_set_size(footer, kPageWidth, footer_h);
    lv_obj_align(footer, LV_ALIGN_BOTTOM_MID, 0, 0);
    lv_obj_set_style_bg_opa(footer, LV_OPA_COVER, 0);
    lv_obj_set_style_bg_color(footer, lv_color_white(), 0);
    lv_obj_set_style_border_width(footer, 1, 0);
    lv_obj_set_style_border_side(footer, LV_BORDER_SIDE_TOP, 0);
    lv_obj_set_style_border_color(footer, lv_color_black(), 0);
    lv_obj_set_style_pad_left(footer, 8, 0);
    lv_obj_set_style_pad_right(footer, 8, 0);
    lv_obj_set_style_pad_top(footer, 2, 0);
    lv_obj_set_style_pad_bottom(footer, 2, 0);

    circuit_footer_ = lv_label_create(footer);
    lv_obj_set_style_text_font(circuit_footer_, font, 0);
    lv_obj_set_width(circuit_footer_, LV_PCT(100));
    lv_obj_set_style_text_align(circuit_footer_, LV_TEXT_ALIGN_LEFT, 0);
    lv_obj_align(circuit_footer_, LV_ALIGN_LEFT_MID, 0, 0);
    lv_label_set_long_mode(circuit_footer_, LV_LABEL_LONG_CLIP);
    lv_label_set_text(circuit_footer_, "[PAGE DOWN] FOR STATS");

    circuit_map_root_ = lv_obj_create(circuit_root_);
    StyleBox(circuit_map_root_);
    lv_obj_set_size(circuit_map_root_, kPageWidth, kPageHeight - kHeaderH - footer_h);
    lv_obj_align(circuit_map_root_, LV_ALIGN_TOP_LEFT, 0, kHeaderH);
    lv_obj_set_style_border_width(circuit_map_root_, 0, 0);
    lv_obj_set_style_pad_all(circuit_map_root_, 4, 0);

    circuit_map_image_ = lv_image_create(circuit_map_root_);
    lv_obj_align(circuit_map_image_, LV_ALIGN_CENTER, 0, 0);
    lv_obj_add_flag(circuit_map_image_, LV_OBJ_FLAG_HIDDEN);
    lv_image_set_antialias(circuit_map_image_, false);

    circuit_map_placeholder_ = lv_label_create(circuit_map_root_);
    lv_obj_set_style_text_font(circuit_map_placeholder_, font, 0);
    lv_label_set_text(circuit_map_placeholder_, "地图加载中...");
    lv_obj_set_style_text_align(circuit_map_placeholder_, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_set_width(circuit_map_placeholder_, LV_PCT(100));
    lv_obj_align(circuit_map_placeholder_, LV_ALIGN_CENTER, 0, 0);

    circuit_stats_root_ = lv_obj_create(circuit_root_);
    StyleBox(circuit_stats_root_);
    lv_obj_set_size(circuit_stats_root_, kPageWidth, kPageHeight - kHeaderH - footer_h);
    lv_obj_align(circuit_stats_root_, LV_ALIGN_TOP_LEFT, 0, kHeaderH);
    lv_obj_set_style_border_width(circuit_stats_root_, 0, 0);
    lv_obj_set_style_pad_all(circuit_stats_root_, 8, 0);

    circuit_stats_title_ = lv_label_create(circuit_stats_root_);
    lv_obj_set_style_text_font(circuit_stats_title_, font, 0);
    lv_obj_align(circuit_stats_title_, LV_ALIGN_TOP_LEFT, 0, 0);
    lv_label_set_text(circuit_stats_title_, "CIRCUIT INFORMATION");

    const lv_coord_t key_w = 160;
    const lv_coord_t val_w = kPageWidth - 16 - key_w;
    const lv_coord_t base_y = 20;
    for (int i = 0; i < static_cast<int>(circuit_stats_k_.size()); i++) {
        const lv_coord_t y = base_y + i * 18;
        circuit_stats_k_[i] = lv_label_create(circuit_stats_root_);
        lv_obj_set_style_text_font(circuit_stats_k_[i], font, 0);
        lv_obj_align(circuit_stats_k_[i], LV_ALIGN_TOP_LEFT, 0, y);
        lv_obj_set_width(circuit_stats_k_[i], key_w);
        lv_label_set_long_mode(circuit_stats_k_[i], LV_LABEL_LONG_CLIP);
        lv_label_set_text(circuit_stats_k_[i], "");

        circuit_stats_v_[i] = lv_label_create(circuit_stats_root_);
        lv_obj_set_style_text_font(circuit_stats_v_[i], font, 0);
        lv_obj_align(circuit_stats_v_[i], LV_ALIGN_TOP_LEFT, key_w, y);
        lv_obj_set_width(circuit_stats_v_[i], val_w);
        lv_obj_set_style_text_align(circuit_stats_v_[i], LV_TEXT_ALIGN_RIGHT, 0);
        lv_label_set_long_mode(circuit_stats_v_[i], LV_LABEL_LONG_CLIP);
        lv_label_set_text(circuit_stats_v_[i], "");
    }

    ApplyCircuitDetailLocked();
}

void F1PageAdapter::ApplyCircuitDetailLocked() {
    if (!built_ || circuit_root_ == nullptr) {
        return;
    }
    if (circuit_header_center_ != nullptr) {
        const std::string title =
            !circuit_name_.empty() ? circuit_name_ : (!circuit_gp_.empty() ? circuit_gp_ : "CIRCUIT");
        SetText(circuit_header_center_, title.c_str());
    }
    if (circuit_header_right_ != nullptr) {
        SetText(circuit_header_right_, circuit_page_ == 0 ? "PG 1/2" : "PG 2/2");
    }
    if (circuit_footer_ != nullptr) {
        SetText(circuit_footer_, circuit_page_ == 0 ? "[PAGE DOWN] FOR STATS" : "[PAGE UP] FOR MAP");
    }
    SetRootVisible(circuit_map_root_, circuit_page_ == 0);
    SetRootVisible(circuit_stats_root_, circuit_page_ == 1);
    ApplyCircuitDetailImageLocked();

    if (circuit_page_ == 1) {
        if (circuit_stats_k_[0] && circuit_stats_v_[0]) {
            SetText(circuit_stats_k_[0], "CIRCUIT LENGTH");
            if (circuit_length_km_ > 0) {
                char buf[32];
                snprintf(buf, sizeof(buf), "%.3f KM", circuit_length_km_);
                SetText(circuit_stats_v_[0], buf);
            } else {
                SetText(circuit_stats_v_[0], "--");
            }
        }
        if (circuit_stats_k_[1] && circuit_stats_v_[1]) {
            SetText(circuit_stats_k_[1], "RACE DISTANCE");
            if (race_distance_km_ > 0) {
                char buf[32];
                snprintf(buf, sizeof(buf), "%.3f KM", race_distance_km_);
                SetText(circuit_stats_v_[1], buf);
            } else {
                SetText(circuit_stats_v_[1], "--");
            }
        }
        if (circuit_stats_k_[2] && circuit_stats_v_[2]) {
            SetText(circuit_stats_k_[2], "NUMBER OF LAPS");
            if (number_of_laps_ > 0) {
                SetTextFmt(circuit_stats_v_[2], "%d", number_of_laps_);
            } else {
                SetText(circuit_stats_v_[2], "--");
            }
        }
        if (circuit_stats_k_[3] && circuit_stats_v_[3]) {
            SetText(circuit_stats_k_[3], "FIRST GRAND PRIX");
            if (first_grand_prix_year_ > 0) {
                SetTextFmt(circuit_stats_v_[3], "%d", first_grand_prix_year_);
            } else {
                SetText(circuit_stats_v_[3], "--");
            }
        }
        if (circuit_stats_k_[4] && circuit_stats_v_[4]) {
            SetText(circuit_stats_k_[4], "FASTEST LAP TIME");
            SetText(circuit_stats_v_[4], fastest_lap_time_.empty() ? "--" : fastest_lap_time_.c_str());
        }
        if (circuit_stats_k_[5] && circuit_stats_v_[5]) {
            SetText(circuit_stats_k_[5], "FASTEST LAP DRIVER");
            SetText(circuit_stats_v_[5], fastest_lap_driver_.empty() ? "--" : fastest_lap_driver_.c_str());
        }
        if (circuit_stats_k_[6] && circuit_stats_v_[6]) {
            SetText(circuit_stats_k_[6], "FASTEST LAP YEAR");
            if (fastest_lap_year_ > 0) {
                SetTextFmt(circuit_stats_v_[6], "%d", fastest_lap_year_);
            } else {
                SetText(circuit_stats_v_[6], "--");
            }
        }
        if (circuit_stats_k_[7] && circuit_stats_v_[7]) {
            SetText(circuit_stats_k_[7], "");
            SetText(circuit_stats_v_[7], "");
        }
    } else {
        StartCircuitDetailFetchIfNeededLocked(circuit_map_url_detail_.c_str());
    }
}
