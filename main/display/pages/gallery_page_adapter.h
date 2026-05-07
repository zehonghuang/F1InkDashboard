#ifndef GALLERY_PAGE_ADAPTER_H
#define GALLERY_PAGE_ADAPTER_H

#include "ui_page.h"

#include <string>
#include <vector>

class LcdDisplay;

class GalleryPageAdapter : public IUiPage {
public:
    explicit GalleryPageAdapter(LcdDisplay* host);

    UiPageId Id() const override;
    const char* Name() const override;
    void Build() override;
    lv_obj_t* Screen() const override;
    void OnShow() override;
    void OnHide() override;
    bool HandleEvent(const UiPageEvent& event) override;

private:
    void ApplyIndex(int index);

    struct GalleryEntry {
        std::string src;
        std::vector<uint8_t> bytes;
        uint32_t w = 0;
        uint32_t h = 0;
    };

    LcdDisplay* host_ = nullptr;
    bool built_ = false;

    lv_obj_t* screen_ = nullptr;
    lv_obj_t* title_label_ = nullptr;
    lv_obj_t* status_label_ = nullptr;
    lv_obj_t* image_ = nullptr;
    lv_obj_t* indicator_label_ = nullptr;

    bool active_ = false;
    bool loading_ = false;
    int current_index_ = 0;
    std::vector<GalleryEntry> entries_;
    std::vector<uint8_t> pic_bin_;
    int pic_x_ = 0;
    int pic_y_ = 0;
    int pic_w_ = 0;
    int pic_h_ = 0;
    bool pic_active_ = false;
};

#endif  // GALLERY_PAGE_ADAPTER_H
