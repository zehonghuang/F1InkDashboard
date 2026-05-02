#include "pages/f1_page_adapter.h"

#include "lcd_display.h"
#include "lvgl_theme.h"
#include "pages/f1_page_adapter_common.h"

#include <array>
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <string_view>
#include <vector>

using namespace f1_page_internal;

namespace {

extern const char formula1_bdf_start[] asm("_binary_Formula1_16_ascii_bdf_start");
extern const char formula1_bdf_end[] asm("_binary_Formula1_16_ascii_bdf_end");

struct BdfGlyph {
    int w = 0;
    int h = 0;
    int xoff = 0;
    int yoff = 0;
    int adv = 0;
    int bytes_per_row = 0;
    std::vector<uint8_t> bitmap;
    bool valid = false;
};

struct BdfFont {
    int ascent = 0;
    int descent = 0;
    bool parsed = false;
    std::array<BdfGlyph, 128> glyphs;
};

static int HexVal(char c) {
    if (c >= '0' && c <= '9') {
        return c - '0';
    }
    if (c >= 'a' && c <= 'f') {
        return 10 + (c - 'a');
    }
    if (c >= 'A' && c <= 'F') {
        return 10 + (c - 'A');
    }
    return -1;
}

static int ParseInt(std::string_view s) {
    int sign = 1;
    size_t i = 0;
    while (i < s.size() && (s[i] == ' ' || s[i] == '\t')) {
        i++;
    }
    if (i < s.size() && s[i] == '-') {
        sign = -1;
        i++;
    }
    int v = 0;
    for (; i < s.size(); i++) {
        if (s[i] < '0' || s[i] > '9') {
            break;
        }
        v = v * 10 + (s[i] - '0');
    }
    return v * sign;
}

static BdfFont& Formula1Font16() {
    static BdfFont font;
    if (font.parsed) {
        return font;
    }
    font.parsed = true;

    const char* p = formula1_bdf_start;
    const char* end = formula1_bdf_end;

    auto next_line = [&]() -> std::string_view {
        if (p >= end) {
            return {};
        }
        const char* s = p;
        const char* nl = static_cast<const char*>(memchr(p, '\n', static_cast<size_t>(end - p)));
        if (nl == nullptr) {
            p = end;
            return std::string_view(s, static_cast<size_t>(end - s));
        }
        p = nl + 1;
        size_t len = static_cast<size_t>(nl - s);
        if (len > 0 && s[len - 1] == '\r') {
            len--;
        }
        return std::string_view(s, len);
    };

    int cur_enc = -1;
    BdfGlyph cur;
    bool in_glyph = false;
    bool in_bitmap = false;
    int bitmap_row = 0;

    while (true) {
        std::string_view line = next_line();
        if (line.empty() && p >= end) {
            break;
        }
        if (line.rfind("FONT_ASCENT ", 0) == 0) {
            font.ascent = ParseInt(line.substr(12));
            continue;
        }
        if (line.rfind("FONT_DESCENT ", 0) == 0) {
            font.descent = ParseInt(line.substr(13));
            continue;
        }
        if (line.rfind("STARTCHAR", 0) == 0) {
            in_glyph = true;
            in_bitmap = false;
            bitmap_row = 0;
            cur_enc = -1;
            cur = BdfGlyph{};
            continue;
        }
        if (!in_glyph) {
            continue;
        }
        if (line.rfind("ENCODING ", 0) == 0) {
            cur_enc = ParseInt(line.substr(9));
            continue;
        }
        if (line.rfind("DWIDTH ", 0) == 0) {
            size_t sp = line.find(' ');
            if (sp != std::string_view::npos) {
                std::string_view rest = line.substr(sp + 1);
                size_t sp2 = rest.find(' ');
                cur.adv = ParseInt(sp2 == std::string_view::npos ? rest : rest.substr(0, sp2));
            }
            continue;
        }
        if (line.rfind("BBX ", 0) == 0) {
            std::string_view rest = line.substr(4);
            size_t p1 = rest.find(' ');
            size_t p2 = p1 == std::string_view::npos ? std::string_view::npos : rest.find(' ', p1 + 1);
            size_t p3 = p2 == std::string_view::npos ? std::string_view::npos : rest.find(' ', p2 + 1);
            if (p1 != std::string_view::npos && p2 != std::string_view::npos && p3 != std::string_view::npos) {
                cur.w = ParseInt(rest.substr(0, p1));
                cur.h = ParseInt(rest.substr(p1 + 1, p2 - (p1 + 1)));
                cur.xoff = ParseInt(rest.substr(p2 + 1, p3 - (p2 + 1)));
                cur.yoff = ParseInt(rest.substr(p3 + 1));
                cur.bytes_per_row = (cur.w + 7) / 8;
            }
            continue;
        }
        if (line == "BITMAP") {
            in_bitmap = true;
            bitmap_row = 0;
            if (cur.h > 0 && cur.bytes_per_row > 0) {
                cur.bitmap.assign(static_cast<size_t>(cur.h * cur.bytes_per_row), 0);
            }
            continue;
        }
        if (line == "ENDCHAR") {
            if (cur_enc >= 0 && cur_enc < static_cast<int>(font.glyphs.size()) && cur.w > 0 && cur.h > 0 &&
                !cur.bitmap.empty()) {
                cur.valid = true;
                font.glyphs[static_cast<size_t>(cur_enc)] = std::move(cur);
            }
            in_glyph = false;
            in_bitmap = false;
            continue;
        }
        if (in_bitmap) {
            if (bitmap_row >= cur.h || cur.bytes_per_row <= 0) {
                continue;
            }
            const size_t need_hex = static_cast<size_t>(cur.bytes_per_row * 2);
            if (line.size() >= need_hex) {
                uint8_t* dst = cur.bitmap.data() + bitmap_row * cur.bytes_per_row;
                for (int i = 0; i < cur.bytes_per_row; i++) {
                    int hi = HexVal(line[static_cast<size_t>(i * 2)]);
                    int lo = HexVal(line[static_cast<size_t>(i * 2 + 1)]);
                    if (hi < 0 || lo < 0) {
                        dst[i] = 0;
                    } else {
                        dst[i] = static_cast<uint8_t>((hi << 4) | lo);
                    }
                }
            }
            bitmap_row++;
        }
    }

    if (font.ascent <= 0) {
        font.ascent = 14;
    }
    return font;
}

}  // namespace

void F1PageAdapter::BuildRaceLocked() {
    auto* lvgl_theme = static_cast<LvglTheme*>(host_->current_theme_);
    const lv_font_t* cn_font = lvgl_theme && lvgl_theme->text_font() ? lvgl_theme->text_font()->font() : nullptr;
    const lv_font_t* icon_font = lvgl_theme && lvgl_theme->icon_font() ? lvgl_theme->icon_font()->font() : nullptr;
    const lv_font_t* small_font = cn_font ? cn_font : LV_FONT_DEFAULT;
    const lv_font_t* record_font = small_font;

    CreateHeader(race_root_, small_font, icon_font, &status_time_, &status_date_, &status_batt_icon_, &status_batt_pct_);

    lv_obj_t* mid_left = lv_obj_create(race_root_);
    StyleBox(mid_left);
    lv_obj_set_size(mid_left, kColW, kMidH);
    lv_obj_align(mid_left, LV_ALIGN_TOP_LEFT, 0, kHeaderH);
    lv_obj_set_style_border_side(
        mid_left,
        static_cast<lv_border_side_t>(LV_BORDER_SIDE_LEFT),
        0);

    race_track_box_ = lv_obj_create(mid_left);
    lv_obj_set_size(race_track_box_, kColW - 8, kMidH - 8);
    lv_obj_align(race_track_box_, LV_ALIGN_TOP_LEFT, 0, 0);
    lv_obj_set_style_border_width(race_track_box_, 0, 0);
    lv_obj_set_style_bg_opa(race_track_box_, LV_OPA_TRANSP, 0);
    lv_obj_set_style_pad_all(race_track_box_, 0, 0);

    race_track_image_ = lv_image_create(race_track_box_);
    lv_obj_align(race_track_image_, LV_ALIGN_CENTER, -3, -3);
    lv_obj_add_flag(race_track_image_, LV_OBJ_FLAG_HIDDEN);
    lv_image_set_antialias(race_track_image_, false);

    race_track_placeholder_ = lv_label_create(race_track_box_);
    lv_label_set_text(race_track_placeholder_, "赛道图\n(加载中)");
    if (cn_font != nullptr) {
        lv_obj_set_style_text_font(race_track_placeholder_, cn_font, 0);
    }
    lv_label_set_long_mode(race_track_placeholder_, LV_LABEL_LONG_WRAP);
    lv_obj_set_width(race_track_placeholder_, LV_PCT(100));
    lv_obj_set_style_text_align(race_track_placeholder_, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_align(race_track_placeholder_, LV_ALIGN_CENTER, -3, -3);

    ApplyCircuitImageLocked();

    lv_obj_t* mid_right = lv_obj_create(race_root_);
    StyleBox(mid_right);
    lv_obj_set_size(mid_right, kColW - 1, kMidH);
    lv_obj_align(mid_right, LV_ALIGN_TOP_LEFT, kColW + 1, kHeaderH);
    lv_obj_set_style_border_side(
        mid_right,
        static_cast<lv_border_side_t>(LV_BORDER_SIDE_RIGHT),
        0);

    race_gp_ = lv_label_create(mid_right);
    lv_label_set_text(race_gp_, "BAHRAIN GRAND PRIX");
    lv_obj_set_width(race_gp_, LV_PCT(100));
    lv_label_set_long_mode(race_gp_, LV_LABEL_LONG_WRAP);
    lv_obj_set_style_text_align(race_gp_, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_align(race_gp_, LV_ALIGN_TOP_MID, 0, 2);
    lv_obj_set_style_text_font(race_gp_, record_font, 0);
    lv_obj_add_flag(race_gp_, LV_OBJ_FLAG_HIDDEN);

    race_round_ = lv_label_create(mid_right);
    lv_label_set_text(race_round_, "ROUND 04");
    lv_obj_align(race_round_, LV_ALIGN_TOP_MID, 0, 22);
    lv_obj_set_style_text_font(race_round_, record_font, 0);
    lv_obj_add_flag(race_round_, LV_OBJ_FLAG_HIDDEN);

    if (race_right_canvas_ == nullptr) {
        const lv_coord_t cw = kColW - 8;
        const lv_coord_t ch = kMidH - 8;

        race_right_canvas_ = lv_canvas_create(mid_right);
        lv_obj_set_size(race_right_canvas_, cw, ch);
        lv_obj_align(race_right_canvas_, LV_ALIGN_TOP_LEFT, 0, 0);
        lv_obj_set_style_border_width(race_right_canvas_, 0, 0);
        lv_obj_set_style_bg_opa(race_right_canvas_, LV_OPA_TRANSP, 0);
        lv_obj_set_style_pad_all(race_right_canvas_, 0, 0);

        const uint32_t stride = lv_draw_buf_width_to_stride(cw, LV_COLOR_FORMAT_I1);
        const uint32_t palette_sz =
            LV_COLOR_INDEXED_PALETTE_SIZE(LV_COLOR_FORMAT_I1) * static_cast<uint32_t>(sizeof(lv_color32_t));
        const uint32_t buf_sz = palette_sz + stride * static_cast<uint32_t>(ch);
        race_right_canvas_buf_ = lv_malloc(buf_sz);
        if (race_right_canvas_buf_ != nullptr) {
            lv_canvas_set_buffer(race_right_canvas_, race_right_canvas_buf_, cw, ch, LV_COLOR_FORMAT_I1);
            lv_canvas_set_palette(race_right_canvas_, 0, lv_color_to_32(lv_color_white(), LV_OPA_COVER));
            lv_canvas_set_palette(race_right_canvas_, 1, lv_color_to_32(lv_color_black(), LV_OPA_COVER));
        }
    }

    lv_obj_t* sep = lv_obj_create(mid_right);
    lv_obj_set_size(sep, kColW - 12, 2);
    lv_obj_align(sep, LV_ALIGN_TOP_MID, 0, 50);
    lv_obj_set_style_bg_color(sep, lv_color_black(), 0);
    lv_obj_set_style_bg_opa(sep, LV_OPA_COVER, 0);
    lv_obj_set_style_border_width(sep, 0, 0);

    race_next_label_ = lv_label_create(mid_right);
    lv_label_set_text(race_next_label_, "NEXT SESSION IN:");
    lv_obj_align(race_next_label_, LV_ALIGN_TOP_MID, 0, 58);
    lv_obj_set_style_text_font(race_next_label_, record_font, 0);
    lv_obj_add_flag(race_next_label_, LV_OBJ_FLAG_HIDDEN);

    race_countdown_ = lv_label_create(mid_right);
    lv_label_set_text(race_countdown_, "01:45:22");
    lv_obj_align(race_countdown_, LV_ALIGN_TOP_MID, 0, 80);
    lv_obj_set_style_text_font(race_countdown_, record_font, 0);
    lv_obj_add_flag(race_countdown_, LV_OBJ_FLAG_HIDDEN);

    race_next_gp_ = lv_label_create(mid_right);
    lv_label_set_text(race_next_gp_, "");
    lv_obj_set_width(race_next_gp_, LV_PCT(100));
    lv_label_set_long_mode(race_next_gp_, LV_LABEL_LONG_WRAP);
    lv_obj_set_style_text_align(race_next_gp_, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_align(race_next_gp_, LV_ALIGN_TOP_MID, 0, 102);
    lv_obj_set_style_text_font(race_next_gp_, record_font, 0);
    lv_obj_add_flag(race_next_gp_, LV_OBJ_FLAG_HIDDEN);

    RenderRaceRightFormula1Locked();

    lv_obj_t* bottom_left = lv_obj_create(race_root_);
    StyleBox(bottom_left);
    lv_obj_set_size(bottom_left, kColW, kBottomH - 1);
    lv_obj_align(bottom_left, LV_ALIGN_TOP_LEFT, 0, kHeaderH + kMidH + 1);
    lv_obj_set_style_border_side(
        bottom_left,
        static_cast<lv_border_side_t>(LV_BORDER_SIDE_LEFT | LV_BORDER_SIDE_BOTTOM),
        0);

    constexpr lv_coord_t kSchedSessionW = 44;
    constexpr lv_coord_t kSchedDayW = 36;
    constexpr lv_coord_t kSchedTimeW = 52;
    const lv_coord_t kSchedStatusW = (kColW - 8) - (kSchedSessionW + kSchedDayW + kSchedTimeW);

    const lv_coord_t row_gap = 2;
    const lv_coord_t base_y = 0;
    for (int i = 0; i < kScheduleRows; i++) {
        const lv_coord_t y = base_y + i * (kRowH - row_gap);
        schedule_cells_[i][0] = CreateCellLabel(bottom_left, 0, y, kSchedSessionW, "", record_font, LV_TEXT_ALIGN_LEFT, LV_LABEL_LONG_CLIP);
        schedule_cells_[i][1] = CreateCellLabel(bottom_left, kSchedSessionW, y, kSchedDayW, "", record_font, LV_TEXT_ALIGN_LEFT, LV_LABEL_LONG_CLIP);
        schedule_cells_[i][2] =
            CreateCellLabel(bottom_left, kSchedSessionW + kSchedDayW, y, kSchedTimeW, "", record_font, LV_TEXT_ALIGN_LEFT, LV_LABEL_LONG_CLIP);
        schedule_cells_[i][3] = CreateCellLabel(
            bottom_left,
            kSchedSessionW + kSchedDayW + kSchedTimeW,
            y,
            kSchedStatusW,
            "",
            record_font,
            LV_TEXT_ALIGN_RIGHT,
            LV_LABEL_LONG_CLIP);
    }

    lv_obj_t* bottom_right = lv_obj_create(race_root_);
    StyleBox(bottom_right);
    lv_obj_set_size(bottom_right, kColW - 1, kBottomH - 1);
    lv_obj_align(bottom_right, LV_ALIGN_TOP_LEFT, kColW + 1, kHeaderH + kMidH + 1);
    lv_obj_set_style_border_side(
        bottom_right,
        static_cast<lv_border_side_t>(LV_BORDER_SIDE_RIGHT | LV_BORDER_SIDE_BOTTOM),
        0);

    constexpr lv_coord_t kKvKeyW = 78;
    const lv_coord_t kKvValW = (kColW - 8) - kKvKeyW;

    const lv_coord_t kv_base_y = 0;
    for (int i = 0; i < kWeatherRows; i++) {
        const lv_coord_t y = kv_base_y + i * (kRowH - row_gap);
        weather_k_[i] = CreateCellLabel(bottom_right, 0, y, kKvKeyW, "", record_font, LV_TEXT_ALIGN_LEFT, LV_LABEL_LONG_CLIP);
        weather_v_[i] = CreateCellLabel(bottom_right, kKvKeyW, y, kKvValW, "", record_font, LV_TEXT_ALIGN_LEFT, LV_LABEL_LONG_DOT);
    }

    lv_obj_t* vline = lv_obj_create(race_root_);
    lv_obj_set_size(vline, 1, kMidH + kBottomH);
    lv_obj_align(vline, LV_ALIGN_TOP_LEFT, kColW, kHeaderH);
    lv_obj_set_style_bg_color(vline, lv_color_black(), 0);
    lv_obj_set_style_bg_opa(vline, LV_OPA_COVER, 0);
    lv_obj_set_style_border_width(vline, 0, 0);

    lv_obj_t* hline = lv_obj_create(race_root_);
    lv_obj_set_size(hline, kPageWidth, 1);
    lv_obj_align(hline, LV_ALIGN_TOP_LEFT, 0, kHeaderH + kMidH);
    lv_obj_set_style_bg_color(hline, lv_color_black(), 0);
    lv_obj_set_style_bg_opa(hline, LV_OPA_COVER, 0);
    lv_obj_set_style_border_width(hline, 0, 0);

    race_q1_ = mid_right;
    race_q2_ = mid_left;
    race_q3_ = bottom_left;
    race_q4_ = bottom_right;
    race_day_focus_ = 2;
}

void F1PageAdapter::UpdateRaceDaySelectionLocked() {
    struct Item {
        lv_obj_t* obj;
        int idx;
    };
    const Item items[] = {
        {race_q1_, 0},
        {race_q2_, 1},
        {race_q3_, 2},
        {race_q4_, 3},
    };
    for (auto& it : items) {
        if (it.obj == nullptr) {
            continue;
        }
        const bool sel = it.idx == race_day_focus_;
        lv_obj_set_style_border_width(it.obj, sel ? 4 : 1, 0);
        lv_obj_set_style_border_color(it.obj, lv_color_black(), 0);
        if (sel) {
            lv_obj_set_style_border_side(it.obj, LV_BORDER_SIDE_FULL, 0);
        } else {
            lv_border_side_t sides = LV_BORDER_SIDE_NONE;
            switch (it.idx) {
                case 0: sides = LV_BORDER_SIDE_RIGHT; break;
                case 1: sides = LV_BORDER_SIDE_LEFT; break;
                case 2: sides = static_cast<lv_border_side_t>(LV_BORDER_SIDE_LEFT | LV_BORDER_SIDE_BOTTOM); break;
                case 3: sides = static_cast<lv_border_side_t>(LV_BORDER_SIDE_RIGHT | LV_BORDER_SIDE_BOTTOM); break;
                default: sides = LV_BORDER_SIDE_NONE; break;
            }
            lv_obj_set_style_border_side(it.obj, sides, 0);
        }
    }
}

void F1PageAdapter::RenderRaceRightFormula1Locked() {
    if (race_right_canvas_ == nullptr || race_right_canvas_buf_ == nullptr) {
        return;
    }
    if (race_gp_ == nullptr || race_round_ == nullptr || race_next_label_ == nullptr || race_countdown_ == nullptr ||
        race_next_gp_ == nullptr) {
        return;
    }

    lv_draw_buf_t* db = lv_canvas_get_draw_buf(race_right_canvas_);
    if (db == nullptr) {
        return;
    }
    const uint32_t palette_sz =
        LV_COLOR_INDEXED_PALETTE_SIZE(LV_COLOR_FORMAT_I1) * static_cast<uint32_t>(sizeof(lv_color32_t));
    uint8_t* data = static_cast<uint8_t*>(db->data);
    if (data == nullptr) {
        return;
    }
    const int cw = static_cast<int>(db->header.w);
    const int ch = static_cast<int>(db->header.h);
    const int stride = static_cast<int>(db->header.stride);
    if (cw <= 0 || ch <= 0 || stride <= 0) {
        return;
    }
    memset(data + palette_sz, 0x00, static_cast<size_t>(stride * ch));

    auto set_px = [&](int x, int y) {
        if (x < 0 || y < 0 || x >= cw || y >= ch) {
            return;
        }
        uint8_t* row = data + palette_sz + y * stride;
        row[x >> 3] = static_cast<uint8_t>(row[x >> 3] | static_cast<uint8_t>(0x80U >> (x & 7)));
    };

    BdfFont& f = Formula1Font16();
    const int ascent = f.ascent > 0 ? f.ascent : 14;
    const int line_h = ascent + 2;

    auto measure = [&](std::string_view s) -> int {
        int w = 0;
        for (char c : s) {
            unsigned char uc = static_cast<unsigned char>(c);
            const BdfGlyph& g = f.glyphs[uc];
            if (g.valid) {
                w += g.adv > 0 ? g.adv : g.w;
            } else {
                w += ascent / 2;
            }
        }
        return w;
    };

    auto draw = [&](int x, int baseline, std::string_view s) {
        int pen = x;
        for (char c : s) {
            unsigned char uc = static_cast<unsigned char>(c);
            const BdfGlyph& g = f.glyphs[uc];
            if (!g.valid || g.bytes_per_row <= 0) {
                pen += ascent / 2;
                continue;
            }
            const int x0 = pen + g.xoff;
            const int y0 = baseline - (g.yoff + g.h);
            const uint8_t* bm = g.bitmap.data();
            for (int row = 0; row < g.h; row++) {
                const uint8_t* src = bm + row * g.bytes_per_row;
                for (int col = 0; col < g.w; col++) {
                    const uint8_t b = src[col >> 3];
                    if (b & static_cast<uint8_t>(0x80U >> (col & 7))) {
                        set_px(x0 + col, y0 + row);
                    }
                }
            }
            pen += g.adv > 0 ? g.adv : g.w;
        }
    };

    auto draw_centered = [&](int y_top, std::string_view s) {
        const int w = measure(s);
        const int x = (cw - w) / 2;
        draw(x, y_top + ascent, s);
    };

    auto draw_wrapped_centered = [&](int y_top, std::string_view s) -> int {
        const int w = measure(s);
        if (w <= cw) {
            draw_centered(y_top, s);
            return 1;
        }
        size_t cut = std::string_view::npos;
        const size_t mid = s.size() / 2;
        if (mid > 0) {
            cut = s.rfind(' ', mid);
            if (cut == std::string_view::npos) {
                cut = s.find(' ', mid);
            }
        }
        if (cut == std::string_view::npos) {
            draw_centered(y_top, s);
            return 1;
        }
        std::string_view a = s.substr(0, cut);
        std::string_view b = s.substr(cut + 1);
        draw_centered(y_top, a);
        draw_centered(y_top + line_h, b);
        return 2;
    };

    const char* gp = lv_label_get_text(race_gp_);
    const char* rd = lv_label_get_text(race_round_);
    const char* nl = lv_label_get_text(race_next_label_);
    const char* cd = lv_label_get_text(race_countdown_);
    const char* ng = lv_label_get_text(race_next_gp_);

    int gp_lines = 0;
    if (gp && gp[0]) {
        gp_lines = draw_wrapped_centered(2, std::string_view(gp));
    }
    if (rd && rd[0]) {
        int rd_y = 22;
        if (gp_lines >= 2) {
            rd_y = 2 + gp_lines * line_h + 2;
        }
        draw_centered(rd_y, std::string_view(rd));
    }
    if (nl && nl[0]) {
        draw_centered(64, std::string_view(nl));
    }
    if (cd && cd[0]) {
        draw_centered(86, std::string_view(cd));
    }
    if (ng && ng[0]) {
        draw_wrapped_centered(110, std::string_view(ng));
    }

    lv_obj_invalidate(race_right_canvas_);
}
