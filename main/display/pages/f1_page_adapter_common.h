#ifndef F1_PAGE_ADAPTER_COMMON_H
#define F1_PAGE_ADAPTER_COMMON_H

#include "ui_page.h"

#include <cstddef>
#include <cstdint>

namespace f1_page_internal {

inline constexpr lv_coord_t kPageWidth = 400;
inline constexpr lv_coord_t kPageHeight = 300;
inline constexpr lv_coord_t kHeaderH = 26;
inline constexpr lv_coord_t kMidH = 162;
inline constexpr lv_coord_t kBottomH = kPageHeight - kHeaderH - kMidH;
inline constexpr lv_coord_t kColW = kPageWidth / 2;
inline constexpr lv_coord_t kRowH = 18;

inline constexpr const char* kTag = "F1Page";
inline constexpr size_t kMaxJsonBytes = 64 * 1024;
inline constexpr size_t kMaxCircuitImageBytes = 800 * 1024;

void StyleScreen(lv_obj_t* obj);
void StyleBox(lv_obj_t* obj);
lv_obj_t* CreateCellLabel(lv_obj_t* parent,
                          lv_coord_t x,
                          lv_coord_t y,
                          lv_coord_t w,
                          const char* text,
                          const lv_font_t* font,
                          lv_text_align_t align,
                          lv_label_long_mode_t long_mode);
void CreateHeader(lv_obj_t* parent,
                  const lv_font_t* font,
                  lv_obj_t** out_time,
                  lv_obj_t** out_date,
                  lv_obj_t** out_batt);
int64_t NowMs();
bool PlayJuWav();

}  // namespace f1_page_internal

#endif  // F1_PAGE_ADAPTER_COMMON_H

