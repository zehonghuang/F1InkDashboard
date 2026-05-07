#ifndef BREAKING_NEWS_PAGE_ADAPTER_H
#define BREAKING_NEWS_PAGE_ADAPTER_H

#include "ui_page.h"

#include <string>

class LcdDisplay;

class BreakingNewsPageAdapter : public IUiPage {
public:
    explicit BreakingNewsPageAdapter(LcdDisplay* host);
    ~BreakingNewsPageAdapter() override = default;

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

#endif  // BREAKING_NEWS_PAGE_ADAPTER_H

