#include "pages/f1_page_adapter_common.h"

#include "application.h"
#include "assets_fs.h"

#include <vector>

#include "esp_log.h"
#include "esp_timer.h"

namespace f1_page_internal {

void StyleScreen(lv_obj_t* obj) {
    lv_obj_set_size(obj, kPageWidth, kPageHeight);
    lv_obj_set_style_bg_color(obj, lv_color_white(), 0);
    lv_obj_set_style_bg_opa(obj, LV_OPA_COVER, 0);
    lv_obj_set_style_border_width(obj, 0, 0);
    lv_obj_set_style_pad_all(obj, 0, 0);
}

void StyleBox(lv_obj_t* obj) {
    lv_obj_set_style_border_width(obj, 1, 0);
    lv_obj_set_style_border_color(obj, lv_color_black(), 0);
    lv_obj_set_style_bg_color(obj, lv_color_white(), 0);
    lv_obj_set_style_bg_opa(obj, LV_OPA_COVER, 0);
    lv_obj_set_style_pad_all(obj, 4, 0);
}

lv_obj_t* CreateCellLabel(lv_obj_t* parent,
                          lv_coord_t x,
                          lv_coord_t y,
                          lv_coord_t w,
                          const char* text,
                          const lv_font_t* font,
                          lv_text_align_t align,
                          lv_label_long_mode_t long_mode) {
    lv_obj_t* l = lv_label_create(parent);
    if (font != nullptr) {
        lv_obj_set_style_text_font(l, font, 0);
    }
    lv_obj_set_style_text_align(l, align, 0);
    lv_obj_set_size(l, w, kRowH);
    lv_obj_align(l, LV_ALIGN_TOP_LEFT, x, y);
    lv_label_set_long_mode(l, long_mode);
    lv_label_set_text(l, text);
    return l;
}

void CreateHeader(lv_obj_t* parent,
                  const lv_font_t* font,
                  lv_obj_t** out_time,
                  lv_obj_t** out_date,
                  lv_obj_t** out_batt) {
    lv_obj_t* bar = lv_obj_create(parent);
    lv_obj_set_size(bar, kPageWidth, kHeaderH);
    lv_obj_align(bar, LV_ALIGN_TOP_MID, 0, 0);
    lv_obj_set_style_bg_opa(bar, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(bar, 1, 0);
    lv_obj_set_style_border_side(bar, LV_BORDER_SIDE_BOTTOM, 0);
    lv_obj_set_style_border_color(bar, lv_color_black(), 0);
    lv_obj_set_style_pad_left(bar, 8, 0);
    lv_obj_set_style_pad_right(bar, 8, 0);
    lv_obj_set_style_pad_top(bar, 4, 0);
    lv_obj_set_style_pad_bottom(bar, 4, 0);

    lv_obj_t* t = lv_label_create(bar);
    if (font != nullptr) {
        lv_obj_set_style_text_font(t, font, 0);
    }
    lv_obj_align(t, LV_ALIGN_LEFT_MID, 0, 0);
    lv_label_set_text(t, "16:14");

    lv_obj_t* d = lv_label_create(bar);
    if (font != nullptr) {
        lv_obj_set_style_text_font(d, font, 0);
    }
    lv_obj_align(d, LV_ALIGN_CENTER, 0, 0);
    lv_label_set_text(d, "SUN APR 19, 2026");

    lv_obj_t* b = lv_label_create(bar);
    if (font != nullptr) {
        lv_obj_set_style_text_font(b, font, 0);
    }
    lv_obj_align(b, LV_ALIGN_RIGHT_MID, 0, 0);
    lv_label_set_text(b, "[||||] 85%");

    if (out_time) {
        *out_time = t;
    }
    if (out_date) {
        *out_date = d;
    }
    if (out_batt) {
        *out_batt = b;
    }
}

int64_t NowMs() {
    return esp_timer_get_time() / 1000;
}

bool PlayJuWav() {
    std::vector<uint8_t> wav;
    if (!ReadAssetsFile("audio/aJu.wav", wav, 256 * 1024)) {
        ESP_LOGW(kTag, "aJu.wav read failed");
        return false;
    }
    ESP_LOGI(kTag, "aJu.wav play bytes=%u", static_cast<unsigned>(wav.size()));
    Application::GetInstance().GetAudioService().PlayWav(wav);
    return true;
}

}  // namespace f1_page_internal

