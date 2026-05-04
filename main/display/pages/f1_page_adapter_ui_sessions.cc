#include "pages/f1_page_adapter.h"

#include "lcd_display.h"
#include "lvgl_theme.h"
#include "pages/f1_page_adapter_common.h"

#include <font_zectrix.h>

#include <cstdio>

using namespace f1_page_internal;

void F1PageAdapter::BuildRaceSessionsLocked() {
    auto* lvgl_theme = static_cast<LvglTheme*>(host_->current_theme_);
    const lv_font_t* cn_font = lvgl_theme && lvgl_theme->text_font() ? lvgl_theme->text_font()->font() : nullptr;
    const lv_font_t* icon_font = lvgl_theme && lvgl_theme->icon_font() ? lvgl_theme->icon_font()->font() : nullptr;
    const lv_font_t* small_font = &lv_font_montserrat_14;
    const lv_font_t* font = cn_font ? cn_font : small_font;

    lv_obj_t* header = lv_obj_create(race_sessions_root_);
    race_sessions_header_root_ = header;
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

    race_sessions_header_left_ = lv_label_create(header);
    lv_obj_set_style_text_font(race_sessions_header_left_, font, 0);
    lv_obj_align(race_sessions_header_left_, LV_ALIGN_LEFT_MID, 0, 0);
    lv_label_set_long_mode(race_sessions_header_left_, LV_LABEL_LONG_CLIP);
    lv_label_set_text(race_sessions_header_left_, "[ FP1 ] SAUDI ARABIA");

    race_sessions_header_center_ = lv_label_create(header);
    lv_obj_set_style_text_font(race_sessions_header_center_, font, 0);
    lv_obj_align(race_sessions_header_center_, LV_ALIGN_CENTER, 0, 0);
    lv_label_set_text(race_sessions_header_center_, "TIME REMAIN: 12:45");

    race_sessions_header_right_ = lv_obj_create(header);
    lv_obj_set_size(race_sessions_header_right_, 88, kHeaderH - 2);
    lv_obj_align(race_sessions_header_right_, LV_ALIGN_RIGHT_MID, 0, 0);
    lv_obj_set_style_bg_opa(race_sessions_header_right_, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(race_sessions_header_right_, 0, 0);
    lv_obj_set_style_pad_all(race_sessions_header_right_, 0, 0);
    lv_obj_set_style_pad_column(race_sessions_header_right_, 4, 0);
    lv_obj_set_flex_flow(race_sessions_header_right_, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(race_sessions_header_right_, LV_FLEX_ALIGN_END, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);

    race_sessions_header_batt_icon_ = lv_label_create(race_sessions_header_right_);
    if (icon_font != nullptr) {
        lv_obj_set_style_text_font(race_sessions_header_batt_icon_, icon_font, 0);
    }
    lv_label_set_text(race_sessions_header_batt_icon_, FONT_ZECTRIX_BATTERY_FULL);

    race_sessions_header_batt_pct_ = lv_label_create(race_sessions_header_right_);
    lv_obj_set_style_text_font(race_sessions_header_batt_pct_, font, 0);
    lv_label_set_text(race_sessions_header_batt_pct_, "95%");

    constexpr lv_coord_t bottom_h = 24;
    const lv_coord_t body_h = kPageHeight - kHeaderH - bottom_h;
    constexpr lv_coord_t right_w = 118;
    const lv_coord_t left_w = kPageWidth - right_w;

    lv_obj_t* left = lv_obj_create(race_sessions_root_);
    StyleBox(left);
    lv_obj_set_size(left, left_w, body_h);
    lv_obj_align(left, LV_ALIGN_TOP_LEFT, 0, kHeaderH);
    lv_obj_set_style_border_side(
        left,
        static_cast<lv_border_side_t>(LV_BORDER_SIDE_RIGHT | LV_BORDER_SIDE_BOTTOM),
        0);
    race_sessions_body_left_ = left;

    lv_obj_t* right = lv_obj_create(race_sessions_root_);
    StyleBox(right);
    lv_obj_set_size(right, right_w, body_h);
    lv_obj_align(right, LV_ALIGN_TOP_LEFT, left_w, kHeaderH);
    lv_obj_set_style_border_side(right, LV_BORDER_SIDE_BOTTOM, 0);
    race_sessions_body_right_ = right;

    const lv_coord_t left_inner_w = left_w - 8;
    const lv_coord_t right_inner_w = right_w - 8;
    const lv_coord_t inner_h = body_h - 8;

    race_sessions_practice_left_ = lv_obj_create(left);
    lv_obj_set_size(race_sessions_practice_left_, left_inner_w, inner_h);
    lv_obj_align(race_sessions_practice_left_, LV_ALIGN_TOP_LEFT, 0, 0);
    lv_obj_set_style_border_width(race_sessions_practice_left_, 0, 0);
    lv_obj_set_style_bg_opa(race_sessions_practice_left_, LV_OPA_TRANSP, 0);
    lv_obj_set_style_pad_all(race_sessions_practice_left_, 0, 0);

    race_sessions_no_data_ = lv_label_create(race_sessions_practice_left_);
    lv_obj_set_style_text_font(race_sessions_no_data_, font, 0);
    lv_label_set_long_mode(race_sessions_no_data_, LV_LABEL_LONG_WRAP);
    lv_obj_set_width(race_sessions_no_data_, LV_PCT(100));
    lv_obj_set_style_text_align(race_sessions_no_data_, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_align(race_sessions_no_data_, LV_ALIGN_CENTER, 0, 0);
    lv_label_set_text(race_sessions_no_data_, "NO DATA");
    lv_obj_add_flag(race_sessions_no_data_, LV_OBJ_FLAG_HIDDEN);

    race_sessions_qualifying_left_ = lv_obj_create(left);
    lv_obj_set_size(race_sessions_qualifying_left_, left_inner_w, inner_h);
    lv_obj_align(race_sessions_qualifying_left_, LV_ALIGN_TOP_LEFT, 0, 0);
    lv_obj_set_style_border_width(race_sessions_qualifying_left_, 0, 0);
    lv_obj_set_style_bg_opa(race_sessions_qualifying_left_, LV_OPA_TRANSP, 0);
    lv_obj_set_style_pad_all(race_sessions_qualifying_left_, 0, 0);

    {
        constexpr lv_coord_t kPosW = 26;
        constexpr lv_coord_t kNoW = 28;
        constexpr lv_coord_t kDriverW = 56;
        constexpr lv_coord_t kBestW = 66;
        constexpr lv_coord_t kGapW = 48;
        const lv_coord_t kLapsW = left_inner_w - (kPosW + kNoW + kDriverW + kBestW + kGapW);

        const lv_coord_t no_x = kPosW;
        const lv_coord_t drv_x = kPosW + kNoW;
        const lv_coord_t best_x = drv_x + kDriverW;
        const lv_coord_t gap_x = best_x + kBestW;
        const lv_coord_t laps_x = gap_x + kGapW;

        lv_obj_set_style_pad_right(CreateCellLabel(race_sessions_practice_left_, 0, 0, kPosW, "POS", font, LV_TEXT_ALIGN_RIGHT, LV_LABEL_LONG_CLIP), 2, 0);
        lv_obj_set_style_pad_right(CreateCellLabel(race_sessions_practice_left_, no_x, 0, kNoW, "NO.", font, LV_TEXT_ALIGN_RIGHT, LV_LABEL_LONG_CLIP), 2, 0);
        lv_obj_set_style_pad_left(CreateCellLabel(race_sessions_practice_left_, drv_x, 0, kDriverW, "", font, LV_TEXT_ALIGN_LEFT, LV_LABEL_LONG_CLIP), 2, 0);
        race_sessions_race_hdr_best_ =
            CreateCellLabel(race_sessions_practice_left_, best_x, 0, kBestW, "STATUS", font, LV_TEXT_ALIGN_RIGHT, LV_LABEL_LONG_CLIP);
        lv_obj_set_style_pad_right(race_sessions_race_hdr_best_, 2, 0);
        race_sessions_race_hdr_gap_ =
            CreateCellLabel(race_sessions_practice_left_, gap_x, 0, kGapW, "", font, LV_TEXT_ALIGN_RIGHT, LV_LABEL_LONG_CLIP);
        lv_obj_set_style_pad_right(race_sessions_race_hdr_gap_, 2, 0);
        race_sessions_race_hdr_laps_ =
            CreateCellLabel(race_sessions_practice_left_, laps_x, 0, kLapsW, "", font, LV_TEXT_ALIGN_RIGHT, LV_LABEL_LONG_CLIP);
        lv_obj_set_style_pad_right(race_sessions_race_hdr_laps_, 2, 0);

        CreateCellLabel(
            race_sessions_practice_left_,
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
            const char* best;
            const char* gap;
            const char* laps;
        };
        const Row rows[] = {
            {"01", "01", "VER", "1:30.056", "---", "24"},
            {"02", "16", "LEC", "1:30.421", "+0.365", "22"},
            {"03", "04", "NOR", "1:30.882", "+0.826", "26"},
            {"04", "44", "HAM", "1:31.012", "+0.956", "18"},
            {"05", "81", "PIA", "1:31.150", "+1.094", "25"},
            {"06", "63", "RUS", "1:31.220", "+1.164", "20"},
            {"07", "55", "SAI", "1:31.405", "+1.349", "23"},
            {"08", "14", "ALO", "1:31.550", "+1.494", "19"},
            {"09", "27", "HUL", "1:31.880", "+1.824", "21"},
            {"10", "18", "STR", "1:32.105", "+2.049", "17"},
        };

        for (int i = 0; i < kSessionsPracticeRows; i++) {
            const lv_coord_t y = kRowH * (i + 2);
            sessions_practice_cells_[static_cast<size_t>(i)][0] =
                CreateCellLabel(race_sessions_practice_left_, 0, y, kPosW, "", font, LV_TEXT_ALIGN_RIGHT, LV_LABEL_LONG_CLIP);
            sessions_practice_cells_[static_cast<size_t>(i)][1] =
                CreateCellLabel(race_sessions_practice_left_, no_x, y, kNoW, "", font, LV_TEXT_ALIGN_RIGHT, LV_LABEL_LONG_CLIP);
            sessions_practice_cells_[static_cast<size_t>(i)][2] =
                CreateCellLabel(race_sessions_practice_left_, drv_x, y, kDriverW, "", font, LV_TEXT_ALIGN_LEFT, LV_LABEL_LONG_DOT);
            sessions_practice_cells_[static_cast<size_t>(i)][3] =
                CreateCellLabel(race_sessions_practice_left_, best_x, y, kBestW, "", font, LV_TEXT_ALIGN_RIGHT, LV_LABEL_LONG_CLIP);
            sessions_practice_cells_[static_cast<size_t>(i)][4] =
                CreateCellLabel(race_sessions_practice_left_, gap_x, y, kGapW, "", font, LV_TEXT_ALIGN_RIGHT, LV_LABEL_LONG_CLIP);
            sessions_practice_cells_[static_cast<size_t>(i)][5] =
                CreateCellLabel(race_sessions_practice_left_, laps_x, y, kLapsW, "", font, LV_TEXT_ALIGN_RIGHT, LV_LABEL_LONG_CLIP);

            lv_obj_set_style_pad_right(sessions_practice_cells_[static_cast<size_t>(i)][0], 2, 0);
            lv_obj_set_style_pad_right(sessions_practice_cells_[static_cast<size_t>(i)][1], 2, 0);
            lv_obj_set_style_pad_left(sessions_practice_cells_[static_cast<size_t>(i)][2], 2, 0);
            lv_obj_set_style_pad_right(sessions_practice_cells_[static_cast<size_t>(i)][3], 2, 0);
            lv_obj_set_style_pad_right(sessions_practice_cells_[static_cast<size_t>(i)][4], 2, 0);
            lv_obj_set_style_pad_right(sessions_practice_cells_[static_cast<size_t>(i)][5], 2, 0);
        }

        for (int i = 0; i < static_cast<int>(sizeof(rows) / sizeof(rows[0])); i++) {
            lv_label_set_text(sessions_practice_cells_[static_cast<size_t>(i)][0], rows[i].pos);
            lv_label_set_text(sessions_practice_cells_[static_cast<size_t>(i)][1], rows[i].no);
            lv_label_set_text(sessions_practice_cells_[static_cast<size_t>(i)][2], rows[i].drv);
            lv_label_set_text(sessions_practice_cells_[static_cast<size_t>(i)][3], rows[i].best);
            lv_label_set_text(sessions_practice_cells_[static_cast<size_t>(i)][4], rows[i].gap);
            lv_label_set_text(sessions_practice_cells_[static_cast<size_t>(i)][5], rows[i].laps);
        }
    }

    {
        constexpr lv_coord_t kPosW = 26;
        constexpr lv_coord_t kNoW = 28;
        constexpr lv_coord_t kDriverW = 56;
        constexpr lv_coord_t kLapW = 66;
        constexpr lv_coord_t kGapW = 48;
        const lv_coord_t kStW = left_inner_w - (kPosW + kNoW + kDriverW + kLapW + kGapW);

        const lv_coord_t no_x = kPosW;
        const lv_coord_t drv_x = kPosW + kNoW;
        const lv_coord_t lap_x = drv_x + kDriverW;
        const lv_coord_t gap_x = lap_x + kLapW;
        const lv_coord_t st_x = gap_x + kGapW;

        lv_obj_set_style_pad_right(CreateCellLabel(race_sessions_qualifying_left_, 0, 0, kPosW, "POS", font, LV_TEXT_ALIGN_RIGHT, LV_LABEL_LONG_CLIP), 2, 0);
        lv_obj_set_style_pad_right(CreateCellLabel(race_sessions_qualifying_left_, no_x, 0, kNoW, "NO.", font, LV_TEXT_ALIGN_RIGHT, LV_LABEL_LONG_CLIP), 2, 0);
        lv_obj_set_style_pad_left(CreateCellLabel(race_sessions_qualifying_left_, drv_x, 0, kDriverW, "", font, LV_TEXT_ALIGN_LEFT, LV_LABEL_LONG_CLIP), 2, 0);
        lv_obj_set_style_pad_right(CreateCellLabel(race_sessions_qualifying_left_, lap_x, 0, kLapW, "LAP", font, LV_TEXT_ALIGN_RIGHT, LV_LABEL_LONG_CLIP), 2, 0);
        lv_obj_set_style_pad_right(CreateCellLabel(race_sessions_qualifying_left_, gap_x, 0, kGapW, "GAP", font, LV_TEXT_ALIGN_RIGHT, LV_LABEL_LONG_CLIP), 2, 0);
        lv_obj_set_style_pad_right(CreateCellLabel(race_sessions_qualifying_left_, st_x, 0, kStW, "ST.", font, LV_TEXT_ALIGN_RIGHT, LV_LABEL_LONG_CLIP), 2, 0);

        CreateCellLabel(
            race_sessions_qualifying_left_,
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
            const char* lap;
            const char* gap;
            const char* st;
        };
        const Row rows_a[] = {
            {"01", "16", "LEC", "1:28.165", "---", "PIT"},
            {"02", "01", "VER", "1:28.210", "+0.045", "FLY"},
            {"03", "04", "NOR", "1:28.450", "+0.285", "OUT"},
            {"04", "63", "RUS", "1:28.610", "+0.445", "FLY"},
            {"05", "81", "PIA", "1:28.700", "+0.535", "PIT"},
            {"06", "44", "HAM", "1:28.740", "+0.575", "PIT"},
            {"07", "55", "SAI", "1:28.950", "+0.785", "FLY"},
        };
        const Row row_10 = {"10", "14", "ALO", "1:29.102", "+0.937", "PIT"};
        const Row rows_b[] = {
            {"11", "27", "HUL", "1:29.440", "+1.275", "PIT"},
            {"12", "23", "ALB", "1:29.800", "+1.635", "PIT"},
        };

        int out_i = 0;
        for (int i = 0; i < static_cast<int>(sizeof(rows_a) / sizeof(rows_a[0])); i++) {
            const lv_coord_t y = kRowH * (out_i + 2);
            lv_obj_set_style_pad_right(CreateCellLabel(race_sessions_qualifying_left_, 0, y, kPosW, rows_a[i].pos, font, LV_TEXT_ALIGN_RIGHT, LV_LABEL_LONG_CLIP), 2, 0);
            lv_obj_set_style_pad_right(CreateCellLabel(race_sessions_qualifying_left_, no_x, y, kNoW, rows_a[i].no, font, LV_TEXT_ALIGN_RIGHT, LV_LABEL_LONG_CLIP), 2, 0);
            lv_obj_set_style_pad_left(CreateCellLabel(race_sessions_qualifying_left_, drv_x, y, kDriverW, rows_a[i].drv, font, LV_TEXT_ALIGN_LEFT, LV_LABEL_LONG_DOT), 2, 0);
            lv_obj_set_style_pad_right(CreateCellLabel(race_sessions_qualifying_left_, lap_x, y, kLapW, rows_a[i].lap, font, LV_TEXT_ALIGN_RIGHT, LV_LABEL_LONG_CLIP), 2, 0);
            lv_obj_set_style_pad_right(CreateCellLabel(race_sessions_qualifying_left_, gap_x, y, kGapW, rows_a[i].gap, font, LV_TEXT_ALIGN_RIGHT, LV_LABEL_LONG_CLIP), 2, 0);
            lv_obj_set_style_pad_right(CreateCellLabel(race_sessions_qualifying_left_, st_x, y, kStW, rows_a[i].st, font, LV_TEXT_ALIGN_RIGHT, LV_LABEL_LONG_CLIP), 2, 0);
            out_i++;
        }

        {
            const lv_coord_t y = kRowH * (out_i + 2);
            lv_obj_set_style_pad_right(CreateCellLabel(race_sessions_qualifying_left_, 0, y, kPosW, row_10.pos, font, LV_TEXT_ALIGN_RIGHT, LV_LABEL_LONG_CLIP), 2, 0);
            lv_obj_set_style_pad_right(CreateCellLabel(race_sessions_qualifying_left_, no_x, y, kNoW, row_10.no, font, LV_TEXT_ALIGN_RIGHT, LV_LABEL_LONG_CLIP), 2, 0);
            lv_obj_set_style_pad_left(CreateCellLabel(race_sessions_qualifying_left_, drv_x, y, kDriverW, row_10.drv, font, LV_TEXT_ALIGN_LEFT, LV_LABEL_LONG_DOT), 2, 0);
            lv_obj_set_style_pad_right(CreateCellLabel(race_sessions_qualifying_left_, lap_x, y, kLapW, row_10.lap, font, LV_TEXT_ALIGN_RIGHT, LV_LABEL_LONG_CLIP), 2, 0);
            lv_obj_set_style_pad_right(CreateCellLabel(race_sessions_qualifying_left_, gap_x, y, kGapW, row_10.gap, font, LV_TEXT_ALIGN_RIGHT, LV_LABEL_LONG_CLIP), 2, 0);
            lv_obj_set_style_pad_right(CreateCellLabel(race_sessions_qualifying_left_, st_x, y, kStW, row_10.st, font, LV_TEXT_ALIGN_RIGHT, LV_LABEL_LONG_CLIP), 2, 0);
            out_i++;
        }

        {
            const lv_coord_t y = kRowH * (out_i + 2);
            CreateCellLabel(
                race_sessions_qualifying_left_,
                0,
                y,
                left_inner_w,
                "------------- [ DROP ZONE ] -------------",
                font,
                LV_TEXT_ALIGN_LEFT,
                LV_LABEL_LONG_CLIP);
            out_i++;
        }

        for (int i = 0; i < static_cast<int>(sizeof(rows_b) / sizeof(rows_b[0])); i++) {
            const lv_coord_t y = kRowH * (out_i + 2);
            lv_obj_set_style_pad_right(CreateCellLabel(race_sessions_qualifying_left_, 0, y, kPosW, rows_b[i].pos, font, LV_TEXT_ALIGN_RIGHT, LV_LABEL_LONG_CLIP), 2, 0);
            lv_obj_set_style_pad_right(CreateCellLabel(race_sessions_qualifying_left_, no_x, y, kNoW, rows_b[i].no, font, LV_TEXT_ALIGN_RIGHT, LV_LABEL_LONG_CLIP), 2, 0);
            lv_obj_set_style_pad_left(CreateCellLabel(race_sessions_qualifying_left_, drv_x, y, kDriverW, rows_b[i].drv, font, LV_TEXT_ALIGN_LEFT, LV_LABEL_LONG_DOT), 2, 0);
            lv_obj_set_style_pad_right(CreateCellLabel(race_sessions_qualifying_left_, lap_x, y, kLapW, rows_b[i].lap, font, LV_TEXT_ALIGN_RIGHT, LV_LABEL_LONG_CLIP), 2, 0);
            lv_obj_set_style_pad_right(CreateCellLabel(race_sessions_qualifying_left_, gap_x, y, kGapW, rows_b[i].gap, font, LV_TEXT_ALIGN_RIGHT, LV_LABEL_LONG_CLIP), 2, 0);
            lv_obj_set_style_pad_right(CreateCellLabel(race_sessions_qualifying_left_, st_x, y, kStW, rows_b[i].st, font, LV_TEXT_ALIGN_RIGHT, LV_LABEL_LONG_CLIP), 2, 0);
            out_i++;
        }
    }

    race_sessions_practice_right_ = lv_obj_create(right);
    lv_obj_set_size(race_sessions_practice_right_, right_inner_w, inner_h);
    lv_obj_align(race_sessions_practice_right_, LV_ALIGN_TOP_LEFT, 0, 0);
    lv_obj_set_style_border_width(race_sessions_practice_right_, 0, 0);
    lv_obj_set_style_bg_opa(race_sessions_practice_right_, LV_OPA_TRANSP, 0);
    lv_obj_set_style_pad_all(race_sessions_practice_right_, 0, 0);

    race_sessions_qualifying_right_ = lv_obj_create(right);
    lv_obj_set_size(race_sessions_qualifying_right_, right_inner_w, inner_h);
    lv_obj_align(race_sessions_qualifying_right_, LV_ALIGN_TOP_LEFT, 0, 0);
    lv_obj_set_style_border_width(race_sessions_qualifying_right_, 0, 0);
    lv_obj_set_style_bg_opa(race_sessions_qualifying_right_, LV_OPA_TRANSP, 0);
    lv_obj_set_style_pad_all(race_sessions_qualifying_right_, 0, 0);

    {
        CreateCellLabel(race_sessions_practice_right_, 0, 0, right_inner_w, "STATUS:", font, LV_TEXT_ALIGN_LEFT, LV_LABEL_LONG_CLIP);

        lv_obj_t* status_box = lv_obj_create(race_sessions_practice_right_);
        lv_obj_set_size(status_box, right_inner_w, kRowH + 6);
        lv_obj_align(status_box, LV_ALIGN_TOP_LEFT, 0, kRowH);
        lv_obj_set_style_border_width(status_box, 1, 0);
        lv_obj_set_style_border_color(status_box, lv_color_black(), 0);
        lv_obj_set_style_bg_color(status_box, lv_color_black(), 0);
        lv_obj_set_style_bg_opa(status_box, LV_OPA_10, 0);
        lv_obj_set_style_pad_all(status_box, 0, 0);

        lv_obj_t* status = lv_label_create(status_box);
        lv_obj_set_style_text_font(status, font, 0);
        lv_obj_set_style_text_align(status, LV_TEXT_ALIGN_CENTER, 0);
        lv_obj_set_width(status, LV_PCT(100));
        lv_obj_align(status, LV_ALIGN_CENTER, 0, 0);
        lv_label_set_text(status, "[ GREEN ]");

        CreateCellLabel(
            race_sessions_practice_right_,
            0,
            kRowH * 3,
            right_inner_w,
            "-------------",
            font,
            LV_TEXT_ALIGN_LEFT,
            LV_LABEL_LONG_CLIP);

        CreateCellLabel(race_sessions_practice_right_, 0, kRowH * 4, right_inner_w, "TRACK TEMP:", font, LV_TEXT_ALIGN_LEFT, LV_LABEL_LONG_CLIP);
        CreateCellLabel(race_sessions_practice_right_, 0, kRowH * 5, right_inner_w, "   42C", font, LV_TEXT_ALIGN_LEFT, LV_LABEL_LONG_CLIP);
        CreateCellLabel(race_sessions_practice_right_, 0, kRowH * 6, right_inner_w, "AIR TEMP:", font, LV_TEXT_ALIGN_LEFT, LV_LABEL_LONG_CLIP);
        CreateCellLabel(race_sessions_practice_right_, 0, kRowH * 7, right_inner_w, "   29C", font, LV_TEXT_ALIGN_LEFT, LV_LABEL_LONG_CLIP);
        CreateCellLabel(
            race_sessions_practice_right_,
            0,
            kRowH * 8,
            right_inner_w,
            "-------------",
            font,
            LV_TEXT_ALIGN_LEFT,
            LV_LABEL_LONG_CLIP);
        CreateCellLabel(race_sessions_practice_right_, 0, kRowH * 9, right_inner_w, "HUMIDITY:", font, LV_TEXT_ALIGN_LEFT, LV_LABEL_LONG_CLIP);
        CreateCellLabel(race_sessions_practice_right_, 0, kRowH * 10, right_inner_w, "   55%", font, LV_TEXT_ALIGN_LEFT, LV_LABEL_LONG_CLIP);
    }

    {
        CreateCellLabel(race_sessions_qualifying_right_, 0, 0, right_inner_w, "SECTOR:", font, LV_TEXT_ALIGN_LEFT, LV_LABEL_LONG_CLIP);
        CreateCellLabel(race_sessions_qualifying_right_, 0, kRowH, right_inner_w, "S1  S2  S3", font, LV_TEXT_ALIGN_LEFT, LV_LABEL_LONG_CLIP);
        CreateCellLabel(race_sessions_qualifying_right_, 0, kRowH * 2, right_inner_w, "[P] [P] [.]",
                        font, LV_TEXT_ALIGN_LEFT, LV_LABEL_LONG_CLIP);
        CreateCellLabel(
            race_sessions_qualifying_right_,
            0,
            kRowH * 3,
            right_inner_w,
            "-------------",
            font,
            LV_TEXT_ALIGN_LEFT,
            LV_LABEL_LONG_CLIP);

        lv_obj_t* kz = lv_label_create(race_sessions_qualifying_right_);
        lv_obj_set_style_text_font(kz, font, 0);
        lv_label_set_long_mode(kz, LV_LABEL_LONG_WRAP);
        lv_obj_set_width(kz, LV_PCT(100));
        lv_obj_align(kz, LV_ALIGN_TOP_LEFT, 0, kRowH * 4);
        lv_label_set_text(kz, "KNOCKOUT ZONE:\nP11 - P15");
    }

    race_sessions_qualifying_body_ = lv_obj_create(race_sessions_root_);
    StyleBox(race_sessions_qualifying_body_);
    lv_obj_set_size(race_sessions_qualifying_body_, kPageWidth, body_h);
    lv_obj_align(race_sessions_qualifying_body_, LV_ALIGN_TOP_LEFT, 0, kHeaderH);
    lv_obj_set_style_border_side(race_sessions_qualifying_body_, LV_BORDER_SIDE_BOTTOM, 0);

    {
        const lv_coord_t inner_w = kPageWidth - 8;
        constexpr lv_coord_t kPosW = 26;
        constexpr lv_coord_t kNoW = 28;
        constexpr lv_coord_t kDriverW = 104;
        constexpr lv_coord_t kLapW = 84;
        constexpr lv_coord_t kGapW = 56;
        constexpr lv_coord_t kStW = 34;
        const lv_coord_t kSecW = inner_w - (kPosW + kNoW + kDriverW + kLapW + kGapW + kStW);

        const lv_coord_t no_x = kPosW;
        const lv_coord_t drv_x = no_x + kNoW;
        const lv_coord_t lap_x = drv_x + kDriverW;
        const lv_coord_t gap_x = lap_x + kLapW;
        const lv_coord_t st_x = gap_x + kGapW;
        const lv_coord_t sec_x = st_x + kStW;

        auto add_cell = [&](lv_coord_t x, lv_coord_t y, lv_coord_t w, const char* text, lv_text_align_t align) {
            lv_obj_t* l = CreateCellLabel(race_sessions_qualifying_body_, x, y, w, text, font, align, LV_LABEL_LONG_CLIP);
            if (align == LV_TEXT_ALIGN_LEFT) {
                lv_obj_set_style_pad_left(l, 2, 0);
            } else if (align == LV_TEXT_ALIGN_RIGHT) {
                lv_obj_set_style_pad_right(l, 2, 0);
            }
            return l;
        };

        add_cell(0, 0, kPosW, "POS", LV_TEXT_ALIGN_RIGHT);
        add_cell(no_x, 0, kNoW, "NO.", LV_TEXT_ALIGN_RIGHT);
        add_cell(drv_x, 0, kDriverW, "", LV_TEXT_ALIGN_LEFT);
        add_cell(lap_x, 0, kLapW, "LAP TIME", LV_TEXT_ALIGN_RIGHT);
        add_cell(gap_x, 0, kGapW, "GAP", LV_TEXT_ALIGN_RIGHT);
        add_cell(st_x, 0, kStW, "ST.", LV_TEXT_ALIGN_RIGHT);
        add_cell(sec_x, 0, kSecW, "SEC(123)", LV_TEXT_ALIGN_LEFT);

        lv_obj_t* sep = lv_obj_create(race_sessions_qualifying_body_);
        lv_obj_set_size(sep, inner_w, 2);
        lv_obj_align(sep, LV_ALIGN_TOP_LEFT, 0, kRowH + 1);
        lv_obj_set_style_bg_color(sep, lv_color_black(), 0);
        lv_obj_set_style_bg_opa(sep, LV_OPA_COVER, 0);
        lv_obj_set_style_border_width(sep, 0, 0);

        const lv_coord_t base_y = kRowH + 4;

        for (int r = 0; r < kSessionsQualiRows; r++) {
            const lv_coord_t y = base_y + (r < 8 ? r : r + 1) * kRowH;
            lv_obj_t* box = lv_obj_create(race_sessions_qualifying_body_);
            lv_obj_set_size(box, inner_w, kRowH);
            lv_obj_align(box, LV_ALIGN_TOP_LEFT, 0, y);
            lv_obj_set_style_bg_opa(box, LV_OPA_TRANSP, 0);
            lv_obj_set_style_border_width(box, 1, 0);
            lv_obj_set_style_border_color(box, lv_color_black(), 0);
            lv_obj_set_style_pad_all(box, 0, 0);
            lv_obj_add_flag(box, LV_OBJ_FLAG_HIDDEN);
            sessions_quali_row_focus_[static_cast<size_t>(r)] = box;
        }

        auto add_row_cell = [&](int row, int col, lv_coord_t x, lv_coord_t y, lv_coord_t w, const char* text, lv_text_align_t align) {
            if (row < 0 || row >= kSessionsQualiRows || col < 0 || col >= kSessionsQualiCols) {
                return;
            }
            lv_obj_t* l = CreateCellLabel(race_sessions_qualifying_body_, x, y, w, text, font, align, LV_LABEL_LONG_CLIP);
            if (align == LV_TEXT_ALIGN_LEFT) {
                lv_obj_set_style_pad_left(l, 2, 0);
            } else if (align == LV_TEXT_ALIGN_RIGHT) {
                lv_obj_set_style_pad_right(l, 2, 0);
            }
            sessions_quali_cells_[static_cast<size_t>(row)][static_cast<size_t>(col)] = l;
        };

        for (int r = 0; r < kSessionsQualiRows; r++) {
            const lv_coord_t y = base_y + (r < 8 ? r : r + 1) * kRowH;
            add_row_cell(r, 0, 0, y, kPosW, "", LV_TEXT_ALIGN_RIGHT);
            add_row_cell(r, 1, no_x, y, kNoW, "", LV_TEXT_ALIGN_RIGHT);
            add_row_cell(r, 2, drv_x, y, kDriverW, "", LV_TEXT_ALIGN_LEFT);
            add_row_cell(r, 3, lap_x, y, kLapW, "", LV_TEXT_ALIGN_RIGHT);
            add_row_cell(r, 4, gap_x, y, kGapW, "", LV_TEXT_ALIGN_RIGHT);
            add_row_cell(r, 5, st_x, y, kStW, "", LV_TEXT_ALIGN_RIGHT);
            add_row_cell(r, 6, sec_x, y, kSecW, "", LV_TEXT_ALIGN_LEFT);
        }

        sessions_drop_zone_ = CreateCellLabel(
            race_sessions_qualifying_body_,
            0,
            base_y + 8 * kRowH,
            inner_w,
            "--------------------- [ DROP ZONE ] -----------------------",
            font,
            LV_TEXT_ALIGN_LEFT,
            LV_LABEL_LONG_CLIP);
        lv_obj_set_style_pad_left(sessions_drop_zone_, 2, 0);

        struct Row {
            const char* pos;
            const char* no;
            const char* drv;
            const char* lap;
            const char* gap;
            const char* st;
            const char* sec;
        };

        const Row init_rows[] = {
            {"01", "16", "LEC", "1:28.165", "---", "PIT", "---"},
            {"02", "01", "VER", "1:28.210", "+0.045", "FLY", "PP-"},
            {"03", "04", "NOR", "1:28.450", "+0.285", "OUT", "---"},
            {"04", "44", "HAM", "1:28.612", "+0.447", "FLY", "GG-"},
            {"05", "81", "PIA", "1:28.750", "+0.585", "PIT", "---"},
            {"06", "63", "RUS", "1:28.820", "+0.655", "FLY", "G--"},
            {"..", "..", "..........", ".........", "......", "...", "..."},
            {"10", "14", "ALO", "1:29.102", "+0.937", "PIT", "---"},
            {"11", "55", "SAI", "1:29.155", "+0.990", "FLY", "P--"},
            {"12", "27", "HUL", "1:29.440", "+1.275", "PIT", "---"},
            {"13", "23", "ALB", "1:29.800", "+1.635", "PIT", "---"},
        };

        for (int i = 0; i < static_cast<int>(sizeof(init_rows) / sizeof(init_rows[0])); i++) {
            lv_label_set_text(sessions_quali_cells_[static_cast<size_t>(i)][0], init_rows[i].pos);
            lv_label_set_text(sessions_quali_cells_[static_cast<size_t>(i)][1], init_rows[i].no);
            lv_label_set_text(sessions_quali_cells_[static_cast<size_t>(i)][2], init_rows[i].drv);
            lv_label_set_text(sessions_quali_cells_[static_cast<size_t>(i)][3], init_rows[i].lap);
            lv_label_set_text(sessions_quali_cells_[static_cast<size_t>(i)][4], init_rows[i].gap);
            lv_label_set_text(sessions_quali_cells_[static_cast<size_t>(i)][5], init_rows[i].st);
            lv_label_set_text(sessions_quali_cells_[static_cast<size_t>(i)][6], init_rows[i].sec);
        }
    }

    race_sessions_race_result_body_ = lv_obj_create(race_sessions_root_);
    StyleBox(race_sessions_race_result_body_);
    lv_obj_set_size(race_sessions_race_result_body_, kPageWidth, body_h);
    lv_obj_align(race_sessions_race_result_body_, LV_ALIGN_TOP_LEFT, 0, kHeaderH);
    lv_obj_set_style_border_side(race_sessions_race_result_body_, LV_BORDER_SIDE_BOTTOM, 0);

    {
        const lv_coord_t inner_w = kPageWidth - 8;
        constexpr lv_coord_t kPosW = 26;
        constexpr lv_coord_t kNoW = 28;
        constexpr lv_coord_t kDriverW = 104;
        constexpr lv_coord_t kGapW = 118;
        constexpr lv_coord_t kPtsW = 34;
        const lv_coord_t kPitW = inner_w - (kPosW + kNoW + kDriverW + kGapW + kPtsW);

        const lv_coord_t no_x = kPosW;
        const lv_coord_t drv_x = no_x + kNoW;
        const lv_coord_t gap_x = drv_x + kDriverW;
        const lv_coord_t pts_x = gap_x + kGapW;
        const lv_coord_t pit_x = pts_x + kPtsW;

        auto add_cell = [&](lv_coord_t x, lv_coord_t y, lv_coord_t w, const char* text, lv_text_align_t align) {
            lv_obj_t* l = CreateCellLabel(race_sessions_race_result_body_, x, y, w, text, font, align, LV_LABEL_LONG_CLIP);
            if (align == LV_TEXT_ALIGN_LEFT) {
                lv_obj_set_style_pad_left(l, 2, 0);
            } else if (align == LV_TEXT_ALIGN_RIGHT) {
                lv_obj_set_style_pad_right(l, 2, 0);
            }
            return l;
        };

        add_cell(0, 0, kPosW, "POS", LV_TEXT_ALIGN_RIGHT);
        add_cell(no_x, 0, kNoW, "NO.", LV_TEXT_ALIGN_RIGHT);
        add_cell(drv_x, 0, kDriverW, "", LV_TEXT_ALIGN_LEFT);
        add_cell(gap_x, 0, kGapW, "GAP/STATUS", LV_TEXT_ALIGN_RIGHT);
        add_cell(pts_x, 0, kPtsW, "PTS", LV_TEXT_ALIGN_RIGHT);
        add_cell(pit_x, 0, kPitW, "PIT", LV_TEXT_ALIGN_RIGHT);

        lv_obj_t* sep = lv_obj_create(race_sessions_race_result_body_);
        lv_obj_set_size(sep, inner_w, 2);
        lv_obj_align(sep, LV_ALIGN_TOP_LEFT, 0, kRowH + 1);
        lv_obj_set_style_bg_color(sep, lv_color_black(), 0);
        lv_obj_set_style_bg_opa(sep, LV_OPA_COVER, 0);
        lv_obj_set_style_border_width(sep, 0, 0);

        const lv_coord_t base_y = kRowH + 4;

        for (int r = 0; r < kSessionsPracticeRows; r++) {
            const lv_coord_t y = base_y + r * kRowH;
            lv_obj_t* box = lv_obj_create(race_sessions_race_result_body_);
            lv_obj_set_size(box, inner_w, kRowH);
            lv_obj_align(box, LV_ALIGN_TOP_LEFT, 0, y);
            lv_obj_set_style_bg_opa(box, LV_OPA_TRANSP, 0);
            lv_obj_set_style_border_width(box, 1, 0);
            lv_obj_set_style_border_color(box, lv_color_black(), 0);
            lv_obj_set_style_pad_all(box, 0, 0);
            lv_obj_add_flag(box, LV_OBJ_FLAG_HIDDEN);
            sessions_practice_row_focus_[static_cast<size_t>(r)] = box;
        }

        auto add_row_cell = [&](int row, int col, lv_coord_t x, lv_coord_t y, lv_coord_t w, lv_text_align_t align) {
            if (row < 0 || row >= kSessionsPracticeRows || col < 0 || col >= kSessionsPracticeCols) {
                return;
            }
            lv_obj_t* l = CreateCellLabel(race_sessions_race_result_body_, x, y, w, "", font, align, LV_LABEL_LONG_CLIP);
            if (align == LV_TEXT_ALIGN_LEFT) {
                lv_obj_set_style_pad_left(l, 2, 0);
            } else if (align == LV_TEXT_ALIGN_RIGHT) {
                lv_obj_set_style_pad_right(l, 2, 0);
            }
            sessions_practice_cells_[static_cast<size_t>(row)][static_cast<size_t>(col)] = l;
        };

        for (int r = 0; r < kSessionsPracticeRows; r++) {
            const lv_coord_t y = base_y + r * kRowH;
            add_row_cell(r, 0, 0, y, kPosW, LV_TEXT_ALIGN_RIGHT);
            add_row_cell(r, 1, no_x, y, kNoW, LV_TEXT_ALIGN_RIGHT);
            add_row_cell(r, 2, drv_x, y, kDriverW, LV_TEXT_ALIGN_LEFT);
            add_row_cell(r, 3, gap_x, y, kGapW, LV_TEXT_ALIGN_RIGHT);
            add_row_cell(r, 4, pts_x, y, kPtsW, LV_TEXT_ALIGN_RIGHT);
            add_row_cell(r, 5, pit_x, y, kPitW, LV_TEXT_ALIGN_RIGHT);
        }

        race_sessions_race_dnf_ = lv_label_create(race_sessions_race_result_body_);
        lv_obj_set_style_text_font(race_sessions_race_dnf_, font, 0);
        lv_label_set_long_mode(race_sessions_race_dnf_, LV_LABEL_LONG_WRAP);
        lv_obj_set_width(race_sessions_race_dnf_, LV_PCT(100));
        lv_obj_align(race_sessions_race_dnf_, LV_ALIGN_BOTTOM_LEFT, 0, -2);
        lv_label_set_text(race_sessions_race_dnf_, "");
    }

    BuildTelemetryLocked();

    lv_obj_t* ticker = lv_obj_create(race_sessions_root_);
    race_sessions_footer_root_ = ticker;
    lv_obj_set_size(ticker, kPageWidth, bottom_h);
    lv_obj_align(ticker, LV_ALIGN_TOP_LEFT, 0, kHeaderH + body_h);
    lv_obj_set_style_bg_opa(ticker, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(ticker, 1, 0);
    lv_obj_set_style_border_side(ticker, LV_BORDER_SIDE_TOP, 0);
    lv_obj_set_style_border_color(ticker, lv_color_black(), 0);
    lv_obj_set_style_pad_left(ticker, 8, 0);
    lv_obj_set_style_pad_right(ticker, 8, 0);
    lv_obj_set_style_pad_top(ticker, 2, 0);
    lv_obj_set_style_pad_bottom(ticker, 2, 0);

    race_sessions_ticker_ = lv_label_create(ticker);
    lv_obj_set_style_text_font(race_sessions_ticker_, font, 0);
    lv_label_set_long_mode(race_sessions_ticker_, LV_LABEL_LONG_CLIP);
    lv_obj_set_width(race_sessions_ticker_, LV_PCT(100));
    lv_obj_set_style_text_align(race_sessions_ticker_, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_align(race_sessions_ticker_, LV_ALIGN_CENTER, 0, 0);
    lv_label_set_text(race_sessions_ticker_, "[NEWS] STROLL REPORTING STEERING ISSUES");

    race_sessions_quali_live_root_ = lv_obj_create(race_sessions_root_);
    lv_obj_set_size(race_sessions_quali_live_root_, kPageWidth, kPageHeight);
    lv_obj_align(race_sessions_quali_live_root_, LV_ALIGN_TOP_LEFT, 0, 0);
    lv_obj_set_style_bg_opa(race_sessions_quali_live_root_, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(race_sessions_quali_live_root_, 0, 0);
    lv_obj_set_style_pad_all(race_sessions_quali_live_root_, 0, 0);
    {
        lv_obj_t* msg = lv_label_create(race_sessions_quali_live_root_);
        lv_obj_set_style_text_font(msg, font, 0);
        lv_label_set_long_mode(msg, LV_LABEL_LONG_WRAP);
        lv_obj_set_width(msg, LV_PCT(100));
        lv_obj_set_style_text_align(msg, LV_TEXT_ALIGN_CENTER, 0);
        lv_obj_align(msg, LV_ALIGN_CENTER, 0, 0);
        lv_label_set_text(msg, "QUALI LIVE\n(N/A)");
    }

    race_sessions_race_live_root_ = lv_obj_create(race_sessions_root_);
    lv_obj_set_size(race_sessions_race_live_root_, kPageWidth, kPageHeight);
    lv_obj_align(race_sessions_race_live_root_, LV_ALIGN_TOP_LEFT, 0, 0);
    lv_obj_set_style_bg_opa(race_sessions_race_live_root_, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(race_sessions_race_live_root_, 0, 0);
    lv_obj_set_style_pad_all(race_sessions_race_live_root_, 0, 0);
    BuildRaceLiveLocked();

    ApplyRaceSessionsLocked();
}

void F1PageAdapter::ApplyRaceSessionsLocked() {
    if (!built_) {
        return;
    }
    const auto p = static_cast<RaceSessionsSubPage>(static_cast<uint8_t>(race_sessions_page_));
    const bool show_quali_result = p == RaceSessionsSubPage::QualiResult;
    const bool show_race_result = p == RaceSessionsSubPage::RaceResult;
    const bool show_quali_live = p == RaceSessionsSubPage::QualiLive;
    const bool show_race_live = p == RaceSessionsSubPage::RaceLive;
    const bool show_telemetry = p == RaceSessionsSubPage::Telemetry;

    if (race_sessions_header_root_ != nullptr) {
        if (show_race_live) {
            lv_obj_add_flag(race_sessions_header_root_, LV_OBJ_FLAG_HIDDEN);
        } else {
            lv_obj_clear_flag(race_sessions_header_root_, LV_OBJ_FLAG_HIDDEN);
        }
    }
    if (race_sessions_footer_root_ != nullptr) {
        if (show_race_live) {
            lv_obj_add_flag(race_sessions_footer_root_, LV_OBJ_FLAG_HIDDEN);
        } else {
            lv_obj_clear_flag(race_sessions_footer_root_, LV_OBJ_FLAG_HIDDEN);
        }
    }

    if (race_sessions_body_left_ != nullptr) {
        lv_obj_add_flag(race_sessions_body_left_, LV_OBJ_FLAG_HIDDEN);
    }
    if (race_sessions_body_right_ != nullptr) {
        lv_obj_add_flag(race_sessions_body_right_, LV_OBJ_FLAG_HIDDEN);
    }
    if (race_sessions_qualifying_body_ != nullptr) {
        if (show_quali_result) {
            lv_obj_clear_flag(race_sessions_qualifying_body_, LV_OBJ_FLAG_HIDDEN);
        } else {
            lv_obj_add_flag(race_sessions_qualifying_body_, LV_OBJ_FLAG_HIDDEN);
        }
    }
    if (race_sessions_race_result_body_ != nullptr) {
        if (show_race_result) {
            lv_obj_clear_flag(race_sessions_race_result_body_, LV_OBJ_FLAG_HIDDEN);
        } else {
            lv_obj_add_flag(race_sessions_race_result_body_, LV_OBJ_FLAG_HIDDEN);
        }
    }
    if (race_sessions_telemetry_body_ != nullptr) {
        if (show_telemetry) {
            lv_obj_clear_flag(race_sessions_telemetry_body_, LV_OBJ_FLAG_HIDDEN);
        } else {
            lv_obj_add_flag(race_sessions_telemetry_body_, LV_OBJ_FLAG_HIDDEN);
        }
    }

    if (race_sessions_practice_left_ != nullptr) {
        lv_obj_add_flag(race_sessions_practice_left_, LV_OBJ_FLAG_HIDDEN);
    }
    if (race_sessions_qualifying_left_ != nullptr) {
        lv_obj_add_flag(race_sessions_qualifying_left_, LV_OBJ_FLAG_HIDDEN);
    }
    if (race_sessions_practice_right_ != nullptr) {
        lv_obj_add_flag(race_sessions_practice_right_, LV_OBJ_FLAG_HIDDEN);
    }

    if (race_sessions_qualifying_right_ != nullptr) {
        lv_obj_add_flag(race_sessions_qualifying_right_, LV_OBJ_FLAG_HIDDEN);
    }

    if (race_sessions_quali_live_root_ != nullptr) {
        if (show_quali_live) {
            lv_obj_clear_flag(race_sessions_quali_live_root_, LV_OBJ_FLAG_HIDDEN);
        } else {
            lv_obj_add_flag(race_sessions_quali_live_root_, LV_OBJ_FLAG_HIDDEN);
        }
    }

    if (race_sessions_race_live_root_ != nullptr) {
        if (show_race_live) {
            lv_obj_clear_flag(race_sessions_race_live_root_, LV_OBJ_FLAG_HIDDEN);
        } else {
            lv_obj_add_flag(race_sessions_race_live_root_, LV_OBJ_FLAG_HIDDEN);
        }
    }

    int cur = 1;
    int total = 1;
    if (p == RaceSessionsSubPage::QualiResult) {
        cur = quali_result_page_ + 1;
        total = quali_result_page_count_;
    } else if (p == RaceSessionsSubPage::RaceResult) {
        cur = race_result_page_ + 1;
        total = race_result_page_count_;
    }
    if (cur < 1) {
        cur = 1;
    }
    if (total < 1) {
        total = 1;
    }
    if (cur > total) {
        cur = total;
    }
    char page[32];
    snprintf(page, sizeof(page), "PAGE %d/%d", cur, total);
    if (race_sessions_ticker_ != nullptr && !show_race_live) {
        lv_label_set_text(race_sessions_ticker_, page);
    }
    if (live_page_ != nullptr && show_race_live) {
        lv_label_set_text(live_page_, page);
    }
}
