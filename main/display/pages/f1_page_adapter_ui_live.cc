#include "pages/f1_page_adapter.h"

#include "lcd_display.h"
#include "lvgl_theme.h"

#include <font_zectrix.h>

#include "pages/f1_page_adapter_common.h"

using namespace f1_page_internal;

void F1PageAdapter::BuildRaceLiveLocked() {
    auto* lvgl_theme = static_cast<LvglTheme*>(host_->current_theme_);
    const lv_font_t* cn_font = lvgl_theme && lvgl_theme->text_font() ? lvgl_theme->text_font()->font() : nullptr;
    const lv_font_t* icon_font = lvgl_theme && lvgl_theme->icon_font() ? lvgl_theme->icon_font()->font() : nullptr;
    const lv_font_t* small_font = &lv_font_montserrat_14;
    const lv_font_t* font = cn_font ? cn_font : small_font;

    lv_obj_t* header = lv_obj_create(race_sessions_race_live_root_);
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

    live_header_left_ = lv_label_create(header);
    lv_obj_set_style_text_font(live_header_left_, font, 0);
    lv_obj_align(live_header_left_, LV_ALIGN_LEFT_MID, 0, 0);
    lv_label_set_long_mode(live_header_left_, LV_LABEL_LONG_CLIP);
    lv_label_set_text(live_header_left_, "[LIVE] MON GP");

    live_header_center_ = lv_label_create(header);
    lv_obj_set_style_text_font(live_header_center_, font, 0);
    lv_obj_align(live_header_center_, LV_ALIGN_CENTER, 0, 0);
    lv_label_set_long_mode(live_header_center_, LV_LABEL_LONG_CLIP);
    lv_label_set_text(live_header_center_, "LAP 45 / 78");

    lv_obj_t* right = lv_obj_create(header);
    lv_obj_set_size(right, 120, kHeaderH - 2);
    lv_obj_align(right, LV_ALIGN_RIGHT_MID, 0, 0);
    lv_obj_set_style_bg_opa(right, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(right, 0, 0);
    lv_obj_set_style_pad_all(right, 0, 0);
    lv_obj_set_style_pad_column(right, 4, 0);
    lv_obj_set_flex_flow(right, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(right, LV_FLEX_ALIGN_END, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);

    live_header_time_ = lv_label_create(right);
    lv_obj_set_style_text_font(live_header_time_, font, 0);
    lv_label_set_text(live_header_time_, "15:30");

    live_header_batt_icon_ = lv_label_create(right);
    if (icon_font != nullptr) {
        lv_obj_set_style_text_font(live_header_batt_icon_, icon_font, 0);
    }
    lv_label_set_text(live_header_batt_icon_, FONT_ZECTRIX_BATTERY_FULL);

    live_header_batt_pct_ = lv_label_create(right);
    lv_obj_set_style_text_font(live_header_batt_pct_, font, 0);
    lv_label_set_text(live_header_batt_pct_, "92%");

    constexpr lv_coord_t bottom_h = 24;
    const lv_coord_t body_h = kPageHeight - kHeaderH - bottom_h;
    constexpr lv_coord_t right_w = 140;
    const lv_coord_t left_w = kPageWidth - right_w;

    lv_obj_t* left_box = lv_obj_create(race_sessions_race_live_root_);
    StyleBox(left_box);
    lv_obj_set_size(left_box, left_w, body_h);
    lv_obj_align(left_box, LV_ALIGN_TOP_LEFT, 0, kHeaderH);
    lv_obj_set_style_border_side(
        left_box,
        static_cast<lv_border_side_t>(LV_BORDER_SIDE_RIGHT | LV_BORDER_SIDE_BOTTOM),
        0);

    lv_obj_t* right_box = lv_obj_create(race_sessions_race_live_root_);
    StyleBox(right_box);
    lv_obj_set_size(right_box, right_w, body_h);
    lv_obj_align(right_box, LV_ALIGN_TOP_LEFT, left_w, kHeaderH);
    lv_obj_set_style_border_side(right_box, LV_BORDER_SIDE_BOTTOM, 0);

    const lv_coord_t left_inner_w = left_w - 8;
    const lv_coord_t right_inner_w = right_w - 8;

    {
        constexpr lv_coord_t kPosW = 26;
        constexpr lv_coord_t kNoW = 28;
        constexpr lv_coord_t kDrvW = 62;
        constexpr lv_coord_t kGapW = 82;
        const lv_coord_t kTyW = left_inner_w - (kPosW + kNoW + kDrvW + kGapW);

        const lv_coord_t no_x = kPosW;
        const lv_coord_t drv_x = no_x + kNoW;
        const lv_coord_t gap_x = drv_x + kDrvW;
        const lv_coord_t ty_x = gap_x + kGapW;

        lv_obj_set_style_pad_right(CreateCellLabel(left_box, 0, 0, kPosW, "POS", font, LV_TEXT_ALIGN_RIGHT, LV_LABEL_LONG_CLIP), 2, 0);
        lv_obj_set_style_pad_right(CreateCellLabel(left_box, no_x, 0, kNoW, "NO.", font, LV_TEXT_ALIGN_RIGHT, LV_LABEL_LONG_CLIP), 2, 0);
        lv_obj_set_style_pad_left(CreateCellLabel(left_box, drv_x, 0, kDrvW, "", font, LV_TEXT_ALIGN_LEFT, LV_LABEL_LONG_CLIP), 2, 0);
        lv_obj_set_style_pad_right(CreateCellLabel(left_box, gap_x, 0, kGapW, "GAP/INT", font, LV_TEXT_ALIGN_RIGHT, LV_LABEL_LONG_CLIP), 2, 0);
        lv_obj_set_style_pad_right(CreateCellLabel(left_box, ty_x, 0, kTyW, "TY", font, LV_TEXT_ALIGN_RIGHT, LV_LABEL_LONG_CLIP), 2, 0);

        CreateCellLabel(
            left_box,
            0,
            kRowH,
            left_inner_w,
            "----------------------------------------------",
            font,
            LV_TEXT_ALIGN_LEFT,
            LV_LABEL_LONG_CLIP);

        struct Row {
            const char* pos;
            const char* no;
            const char* drv;
            const char* gap;
            const char* ty;
        };
        const Row rows[] = {
            {"01", "01", "VER", "---", "[H]"},
            {"02", "04", "NOR", "+4.250", "[H]"},
            {"03", "16", "LEC", "+1.502", "[M]"},
            {"04", "81", "PIA", "+0.880", "[M]"},
            {"05", "63", "RUS", "+12.44", "[H]"},
            {"06", "44", "HAM", "+1.200", "[S]"},
            {"07", "55", "SAI", "+3.115", "[H]"},
            {"08", "14", "ALO", "+15.02", "[M]"},
            {"09", "23", "ALB", "+2.440", "[H]"},
            {"10", "27", "HUL", "+0.950", "[S]"},
        };

        auto add_cell = [&](int row, int col, lv_coord_t x, lv_coord_t y, lv_coord_t w, lv_text_align_t align) {
            if (row < 0 || row >= kLiveRows || col < 0 || col >= kLiveCols) {
                return;
            }
            lv_obj_t* l = CreateCellLabel(left_box, x, y, w, "", font, align, LV_LABEL_LONG_CLIP);
            if (align == LV_TEXT_ALIGN_LEFT) {
                lv_obj_set_style_pad_left(l, 2, 0);
            } else if (align == LV_TEXT_ALIGN_RIGHT) {
                lv_obj_set_style_pad_right(l, 2, 0);
            }
            live_cells_[static_cast<size_t>(row)][static_cast<size_t>(col)] = l;
        };

        for (int i = 0; i < kLiveRows; i++) {
            const lv_coord_t y = kRowH * (i + 2);
            add_cell(i, 0, 0, y, kPosW, LV_TEXT_ALIGN_RIGHT);
            add_cell(i, 1, no_x, y, kNoW, LV_TEXT_ALIGN_RIGHT);
            add_cell(i, 2, drv_x, y, kDrvW, LV_TEXT_ALIGN_LEFT);
            add_cell(i, 3, gap_x, y, kGapW, LV_TEXT_ALIGN_RIGHT);
            add_cell(i, 4, ty_x, y, kTyW, LV_TEXT_ALIGN_RIGHT);
        }

        for (int i = 0; i < kLiveRows; i++) {
            lv_label_set_text(live_cells_[static_cast<size_t>(i)][0], rows[i].pos);
            lv_label_set_text(live_cells_[static_cast<size_t>(i)][1], rows[i].no);
            lv_label_set_text(live_cells_[static_cast<size_t>(i)][2], rows[i].drv);
            lv_label_set_text(live_cells_[static_cast<size_t>(i)][3], rows[i].gap);
            lv_label_set_text(live_cells_[static_cast<size_t>(i)][4], rows[i].ty);
        }
    }

    {
        CreateCellLabel(right_box, 0, 0, right_inner_w, "TRACK STATUS:", font, LV_TEXT_ALIGN_LEFT, LV_LABEL_LONG_CLIP);
        lv_obj_t* status_box = lv_obj_create(right_box);
        lv_obj_set_size(status_box, right_inner_w, kRowH + 8);
        lv_obj_align(status_box, LV_ALIGN_TOP_LEFT, 0, kRowH);
        lv_obj_set_style_border_width(status_box, 1, 0);
        lv_obj_set_style_border_color(status_box, lv_color_black(), 0);
        lv_obj_set_style_bg_color(status_box, lv_color_black(), 0);
        lv_obj_set_style_bg_opa(status_box, LV_OPA_COVER, 0);
        lv_obj_set_style_pad_all(status_box, 0, 0);

        live_track_status_ = lv_label_create(status_box);
        lv_obj_set_style_text_font(live_track_status_, font, 0);
        lv_obj_set_style_text_color(live_track_status_, lv_color_white(), 0);
        lv_obj_set_style_text_align(live_track_status_, LV_TEXT_ALIGN_CENTER, 0);
        lv_obj_set_width(live_track_status_, LV_PCT(100));
        lv_obj_align(live_track_status_, LV_ALIGN_CENTER, 0, 0);
        lv_label_set_text(live_track_status_, "[ GREEN ]");

        CreateCellLabel(right_box, 0, kRowH * 3 + 8, right_inner_w, "---------------------", font, LV_TEXT_ALIGN_LEFT, LV_LABEL_LONG_CLIP);

        CreateCellLabel(right_box, 0, kRowH * 4 + 8, right_inner_w, "FASTEST LAP:", font, LV_TEXT_ALIGN_LEFT, LV_LABEL_LONG_CLIP);
        live_fastest_lap_ = lv_label_create(right_box);
        lv_obj_set_style_text_font(live_fastest_lap_, font, 0);
        lv_label_set_long_mode(live_fastest_lap_, LV_LABEL_LONG_WRAP);
        lv_obj_set_width(live_fastest_lap_, LV_PCT(100));
        lv_obj_align(live_fastest_lap_, LV_ALIGN_TOP_LEFT, 0, kRowH * 5 + 8);
        lv_label_set_text(live_fastest_lap_, "#16 LEC\n1:14.502 (L38)");

        CreateCellLabel(right_box, 0, kRowH * 8 + 4, right_inner_w, "---------------------", font, LV_TEXT_ALIGN_LEFT, LV_LABEL_LONG_CLIP);

        live_temps_ = lv_label_create(right_box);
        lv_obj_set_style_text_font(live_temps_, font, 0);
        lv_label_set_long_mode(live_temps_, LV_LABEL_LONG_WRAP);
        lv_obj_set_width(live_temps_, LV_PCT(100));
        lv_obj_align(live_temps_, LV_ALIGN_TOP_LEFT, 0, kRowH * 9 + 4);
        lv_label_set_text(live_temps_, "TRACK: 38C\nAIR:   24C\nHUM:   45%");
    }

    lv_obj_t* footer = lv_obj_create(race_sessions_race_live_root_);
    lv_obj_set_size(footer, kPageWidth, bottom_h);
    lv_obj_align(footer, LV_ALIGN_TOP_LEFT, 0, kHeaderH + body_h);
    lv_obj_set_style_bg_opa(footer, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(footer, 1, 0);
    lv_obj_set_style_border_side(footer, LV_BORDER_SIDE_TOP, 0);
    lv_obj_set_style_border_color(footer, lv_color_black(), 0);
    lv_obj_set_style_pad_left(footer, 8, 0);
    lv_obj_set_style_pad_right(footer, 8, 0);
    lv_obj_set_style_pad_top(footer, 2, 0);
    lv_obj_set_style_pad_bottom(footer, 2, 0);

    live_page_ = lv_label_create(footer);
    lv_obj_set_style_text_font(live_page_, font, 0);
    lv_label_set_long_mode(live_page_, LV_LABEL_LONG_CLIP);
    lv_obj_set_style_text_align(live_page_, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_set_width(live_page_, LV_PCT(100));
    lv_obj_align(live_page_, LV_ALIGN_CENTER, 0, 0);
    lv_label_set_text(live_page_, "PAGE 1/1");
}
