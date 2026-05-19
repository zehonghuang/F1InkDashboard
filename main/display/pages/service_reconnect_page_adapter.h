#ifndef SERVICE_RECONNECT_PAGE_ADAPTER_H
#define SERVICE_RECONNECT_PAGE_ADAPTER_H

#include "ui_page.h"

#include <string>

class LcdDisplay;

class ServiceReconnectPageAdapter : public IUiPage {
public:
    explicit ServiceReconnectPageAdapter(LcdDisplay* host);
    ~ServiceReconnectPageAdapter() override = default;

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

#endif  // SERVICE_RECONNECT_PAGE_ADAPTER_H
