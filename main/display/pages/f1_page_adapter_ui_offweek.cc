#include "pages/f1_page_adapter.h"

#include "lcd_display.h"
#include "lvgl_theme.h"
#include "pages/f1_page_adapter_common.h"

using namespace f1_page_internal;

void F1PageAdapter::BuildStandingsLocked() {
    auto* lvgl_theme = static_cast<LvglTheme*>(host_->current_theme_);
    const lv_font_t* cn_font = lvgl_theme && lvgl_theme->text_font() ? lvgl_theme->text_font()->font() : nullptr;
    const lv_font_t* small_font = &lv_font_montserrat_14;
    const lv_font_t* record_font = cn_font ? cn_font : small_font;

    lv_obj_t* header = lv_obj_create(standings_root_);
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

    standings_header_left_ = lv_label_create(header);
    lv_obj_set_style_text_font(standings_header_left_, record_font, 0);
    lv_obj_align(standings_header_left_, LV_ALIGN_LEFT_MID, 0, 0);
    lv_label_set_text(standings_header_left_, "2026 F1 SEASON STANDINGS");

    standings_header_right_ = lv_label_create(header);
    lv_obj_set_style_text_font(standings_header_right_, record_font, 0);
    lv_obj_align(standings_header_right_, LV_ALIGN_RIGHT_MID, 0, 0);
    lv_label_set_text(standings_header_right_, "DAYS TO NEXT");

    off_q1_ = lv_obj_create(standings_root_);
    StyleBox(off_q1_);
    lv_obj_set_size(off_q1_, kColW, kHeaderH + kMidH - kHeaderH);
    lv_obj_align(off_q1_, LV_ALIGN_TOP_LEFT, 0, kHeaderH);
    lv_obj_set_style_border_side(
        off_q1_,
        static_cast<lv_border_side_t>(LV_BORDER_SIDE_LEFT | LV_BORDER_SIDE_RIGHT | LV_BORDER_SIDE_BOTTOM),
        0);

    constexpr lv_coord_t kRankW = 22;
    constexpr lv_coord_t kPtsW = 34;
    constexpr lv_coord_t kCodeW = 46;
    const lv_coord_t inner_w = kColW - 8;
    const lv_coord_t pts_x = inner_w - kPtsW;
    const lv_coord_t code_x = pts_x - kCodeW;
    const lv_coord_t name_x = kRankW;
    const lv_coord_t name_w = code_x - name_x;

    CreateCellLabel(off_q1_, 0, 0, name_w, "DRIVER (WDC)", record_font, LV_TEXT_ALIGN_LEFT, LV_LABEL_LONG_CLIP);
    CreateCellLabel(off_q1_, pts_x, 0, kPtsW, "PTS", record_font, LV_TEXT_ALIGN_RIGHT, LV_LABEL_LONG_CLIP);

    for (int i = 0; i < kDriverRows; i++) {
        const lv_coord_t y = kRowH * (i + 1);
        driver_cells_[i][0] = CreateCellLabel(off_q1_, 0, y, kRankW, "", record_font, LV_TEXT_ALIGN_LEFT, LV_LABEL_LONG_CLIP);
        driver_cells_[i][1] = CreateCellLabel(off_q1_, name_x, y, name_w, "", record_font, LV_TEXT_ALIGN_LEFT, LV_LABEL_LONG_DOT);
        driver_cells_[i][2] = CreateCellLabel(off_q1_, code_x, y, kCodeW, "", record_font, LV_TEXT_ALIGN_LEFT, LV_LABEL_LONG_CLIP);
        driver_cells_[i][3] = CreateCellLabel(off_q1_, pts_x, y, kPtsW, "", record_font, LV_TEXT_ALIGN_RIGHT, LV_LABEL_LONG_CLIP);
    }

    off_q2_ = lv_obj_create(standings_root_);
    StyleBox(off_q2_);
    lv_obj_set_size(off_q2_, kColW, kMidH);
    lv_obj_align(off_q2_, LV_ALIGN_TOP_LEFT, kColW, kHeaderH);
    lv_obj_set_style_border_side(
        off_q2_,
        static_cast<lv_border_side_t>(LV_BORDER_SIDE_RIGHT | LV_BORDER_SIDE_BOTTOM),
        0);

    standings_days_ = lv_label_create(off_q2_);
    lv_label_set_text(standings_days_, "12\nDAYS\nUNTIL SAUDI ARABIA");
    lv_obj_set_style_text_align(standings_days_, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_set_style_text_font(standings_days_, record_font, 0);
    lv_obj_set_style_text_line_space(standings_days_, -1, 0);
    lv_obj_set_width(standings_days_, LV_PCT(100));
    lv_label_set_long_mode(standings_days_, LV_LABEL_LONG_WRAP);
    lv_obj_align(standings_days_, LV_ALIGN_CENTER, 0, 0);

    off_q3_ = lv_obj_create(standings_root_);
    StyleBox(off_q3_);
    lv_obj_set_size(off_q3_, kColW, kBottomH);
    lv_obj_align(off_q3_, LV_ALIGN_TOP_LEFT, 0, kHeaderH + kMidH);
    lv_obj_set_style_border_side(
        off_q3_,
        static_cast<lv_border_side_t>(LV_BORDER_SIDE_LEFT | LV_BORDER_SIDE_RIGHT | LV_BORDER_SIDE_BOTTOM),
        0);

    constexpr lv_coord_t kTeamRankW = 22;
    constexpr lv_coord_t kTeamPtsW = 34;
    const lv_coord_t inner_w2 = kColW - 8;
    const lv_coord_t pts_x2 = inner_w2 - kTeamPtsW;
    const lv_coord_t name_x2 = kTeamRankW;
    const lv_coord_t team_w = pts_x2 - name_x2;

    CreateCellLabel(off_q3_, 0, 0, team_w, "CONSTRUCTOR (WCC)", record_font, LV_TEXT_ALIGN_LEFT, LV_LABEL_LONG_CLIP);
    CreateCellLabel(off_q3_, pts_x2, 0, kTeamPtsW, "PTS", record_font, LV_TEXT_ALIGN_RIGHT, LV_LABEL_LONG_CLIP);

    for (int i = 0; i < kConstructorRows; i++) {
        const lv_coord_t y = kRowH * (i + 1);
        constructor_cells_[i][0] = CreateCellLabel(off_q3_, 0, y, kTeamRankW, "", record_font, LV_TEXT_ALIGN_LEFT, LV_LABEL_LONG_CLIP);
        constructor_cells_[i][1] = CreateCellLabel(off_q3_, name_x2, y, team_w, "", record_font, LV_TEXT_ALIGN_LEFT, LV_LABEL_LONG_DOT);
        constructor_cells_[i][2] = CreateCellLabel(off_q3_, pts_x2, y, kTeamPtsW, "", record_font, LV_TEXT_ALIGN_RIGHT, LV_LABEL_LONG_CLIP);
    }

    off_q4_ = lv_obj_create(standings_root_);
    StyleBox(off_q4_);
    lv_obj_set_size(off_q4_, kColW, kBottomH);
    lv_obj_align(off_q4_, LV_ALIGN_TOP_LEFT, kColW, kHeaderH + kMidH);
    lv_obj_set_style_border_side(
        off_q4_,
        static_cast<lv_border_side_t>(LV_BORDER_SIDE_RIGHT | LV_BORDER_SIDE_BOTTOM),
        0);

    news_ = lv_label_create(off_q4_);
    lv_label_set_text(
        news_,
        "NEWS FLASH:\n"
        "Audi confirms 2026 engine\n"
        "performance targets are on\n"
        "schedule.");
    lv_obj_set_style_text_font(news_, record_font, 0);
    lv_obj_set_style_text_line_space(news_, -1, 0);
    lv_obj_set_width(news_, LV_PCT(100));
    lv_label_set_long_mode(news_, LV_LABEL_LONG_WRAP);
    lv_obj_align(news_, LV_ALIGN_TOP_LEFT, 0, 0);
}

void F1PageAdapter::UpdateOffWeekSelectionLocked() {
    struct Item {
        lv_obj_t* obj;
        int idx;
    };
    const Item items[] = {
        {off_q1_, 0},
        {off_q2_, 1},
        {off_q3_, 2},
        {off_q4_, 3},
    };
    for (auto& it : items) {
        if (it.obj == nullptr) {
            continue;
        }
        const bool sel = it.idx == off_week_focus_;
        lv_obj_set_style_border_width(it.obj, sel ? 4 : 1, 0);
        lv_obj_set_style_border_color(it.obj, sel ? lv_color_black() : lv_color_black(), 0);
    }
}
