#ifndef OVERLAY_TEXT_PAGE_ADAPTER_H
#define OVERLAY_TEXT_PAGE_ADAPTER_H

#include "ui_page.h"

#include <string>

class LcdDisplay;

class OverlayTextPageAdapter : public IUiPage {
public:
    explicit OverlayTextPageAdapter(LcdDisplay* host);
    ~OverlayTextPageAdapter() override = default;

    UiPageId Id() const override;
    const char* Name() const override;
    void Build() override;
    lv_obj_t* Screen() const override;
    void OnShow() override;

    void UpdateText(const std::string& text);

private:
    LcdDisplay* host_ = nullptr;
    bool built_ = false;
    lv_obj_t* screen_ = nullptr;
    lv_obj_t* label_ = nullptr;
    std::string text_;
};

#endif  // OVERLAY_TEXT_PAGE_ADAPTER_H
