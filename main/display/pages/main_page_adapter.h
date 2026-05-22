#ifndef MAIN_PAGE_ADAPTER_H
#define MAIN_PAGE_ADAPTER_H

#include "ui_page.h"

class LcdDisplay;

class MainPageAdapter : public IUiPage {
public:
    explicit MainPageAdapter(LcdDisplay* host);

    UiPageId Id() const override;
    const char* Name() const override;
    void Build() override;
    lv_obj_t* Screen() const override;
    void OnShow() override;
    bool HandleEvent(const UiPageEvent& event) override;

private:
    LcdDisplay* host_ = nullptr;
    bool built_ = false;
    lv_obj_t* screen_ = nullptr;
    lv_obj_t* title_label_ = nullptr;
    lv_obj_t* hint_label_ = nullptr;
};

#endif  // MAIN_PAGE_ADAPTER_H
