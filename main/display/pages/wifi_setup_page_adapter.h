#ifndef WIFI_SETUP_PAGE_ADAPTER_H
#define WIFI_SETUP_PAGE_ADAPTER_H

#include "ui_page.h"

#include <cstddef>
#include <string>
#include <cstdint>
#include <vector>

class LcdDisplay;

class WifiSetupPageAdapter : public IUiPage {
public:
    explicit WifiSetupPageAdapter(LcdDisplay* host);

    UiPageId Id() const override;
    const char* Name() const override;
    void Build() override;
    lv_obj_t* Screen() const override;
    void OnShow() override;
    void OnHide() override;
    bool HandleEvent(const UiPageEvent& event) override;

    void UpdateInfo(const std::string& ap_ssid, const std::string& web_url, const std::string& status);

private:
    void RefreshLabelsLocked();
    void LoadSplashLocked();

    LcdDisplay* host_ = nullptr;
    bool built_ = false;
    std::string ap_ssid_;
    std::string web_url_;
    std::string status_;

    lv_obj_t* screen_ = nullptr;
    lv_obj_t* splash_area_ = nullptr;
    lv_obj_t* splash_image_ = nullptr;
    lv_obj_t* splash_hint_label_ = nullptr;
    lv_obj_t* title_label_ = nullptr;
    lv_obj_t* ssid_label_ = nullptr;
    lv_obj_t* url_label_ = nullptr;
    lv_obj_t* steps_label_ = nullptr;
    lv_obj_t* status_label_ = nullptr;

    std::vector<uint8_t> splash_bin_;
    int splash_x_ = 0;
    int splash_y_ = 0;
    int splash_w_ = 0;
    int splash_h_ = 0;
    bool splash_active_ = false;

    uint16_t splash_blank_px_ = 0xFFFF;
    lv_image_dsc_t splash_blank_dsc_ = {};
};

#endif  // WIFI_SETUP_PAGE_ADAPTER_H
