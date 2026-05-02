#ifndef MEME_PAGE_ADAPTER_H
#define MEME_PAGE_ADAPTER_H

#include "ui_page.h"

#include <cstdint>
#include <string>
#include <vector>

class LcdDisplay;

class MemePageAdapter : public IUiPage {
public:
    explicit MemePageAdapter(LcdDisplay* host);
    ~MemePageAdapter() override = default;

    UiPageId Id() const override;
    const char* Name() const override;
    void Build() override;
    lv_obj_t* Screen() const override;
    void OnShow() override;
    void OnHide() override;

    void Update(const std::string& title, std::vector<uint8_t> png_bytes);

private:
    void RenderIfPossible();

    LcdDisplay* host_ = nullptr;
    bool built_ = false;
    bool active_ = false;
    lv_obj_t* screen_ = nullptr;
    lv_obj_t* title_ = nullptr;
    lv_obj_t* image_box_ = nullptr;

    std::string title_text_;
    std::vector<uint8_t> png_bytes_;

    bool pic_active_ = false;
    int pic_x_ = 0;
    int pic_y_ = 0;
    int pic_w_ = 0;
    int pic_h_ = 0;
    std::vector<uint8_t> pic_bin_;
};

#endif  // MEME_PAGE_ADAPTER_H

