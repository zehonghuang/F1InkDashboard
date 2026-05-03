#ifndef LCD_DISPLAY_H
#define LCD_DISPLAY_H

#include "lvgl_display.h"
#include "ui_page_registry.h"

#include <esp_lcd_panel_io.h>
#include <esp_lcd_panel_ops.h>

#include <memory>
#include <string>
#include <vector>

class FactoryTestPageAdapter;
class WifiSetupPageAdapter;
class F1PageAdapter;
class BreakingNewsPageAdapter;
class MemePageAdapter;

class LcdDisplay : public LvglDisplay {
public:
    struct StatusBarWidgets {
        lv_obj_t* time = nullptr;
        lv_obj_t* date = nullptr;
        lv_obj_t* batt_icon = nullptr;
        lv_obj_t* batt_pct = nullptr;
    };

protected:
    esp_lcd_panel_io_handle_t panel_io_ = nullptr;
    esp_lcd_panel_handle_t panel_ = nullptr;
    lv_obj_t* factory_test_screen_ = nullptr;
    lv_obj_t* wifi_setup_screen_ = nullptr;
    lv_obj_t* f1_screen_ = nullptr;
    lv_obj_t* breaking_news_screen_ = nullptr;
    lv_obj_t* meme_screen_ = nullptr;

    UiPageRegistry page_registry_;
    std::vector<UiPageId> page_stack_;
    FactoryTestPageAdapter* factory_test_page_adapter_ = nullptr;
    WifiSetupPageAdapter* wifi_setup_page_adapter_ = nullptr;
    F1PageAdapter* f1_page_adapter_ = nullptr;
    BreakingNewsPageAdapter* breaking_news_page_adapter_ = nullptr;
    MemePageAdapter* meme_page_adapter_ = nullptr;
    bool ui_setup_done_ = false;
    bool raw_1bpp_visible_ = false;

    std::vector<StatusBarWidgets> status_bar_widgets_;
    int64_t status_bar_last_update_ms_ = 0;

    void ShowScreen(lv_obj_t* scr);
    bool RegisterPageLocked(std::unique_ptr<IUiPage> page);
    bool SwitchPageLocked(UiPageId id);
    bool NavigateToLocked(UiPageId id);
    bool BackLocked();
    void SetupUI();
    void RegisterStatusBarWidgetsLocked(const StatusBarWidgets& w);
    void UpdateStatusBarLocked(bool update_all);

    bool Lock(int timeout_ms = 0) override;
    void Unlock() override;

    friend class FactoryTestPageAdapter;
    friend class WifiSetupPageAdapter;
    friend class F1PageAdapter;
    friend class BreakingNewsPageAdapter;
    friend class MemePageAdapter;

    LcdDisplay(esp_lcd_panel_io_handle_t panel_io, esp_lcd_panel_handle_t panel, int width, int height);

public:
    ~LcdDisplay() override;

    void SetEmotion(const char* emotion) override;
    void SetChatMessage(const char* role, const char* content) override;
    void SetPreviewImage(std::unique_ptr<LvglImage> image);
    void SetTheme(Theme* theme) override;
    void UpdateStatusBar(bool update_all = false) override;

    bool RegisterPage(std::unique_ptr<IUiPage> page);
    bool SwitchPage(UiPageId id);
    bool NavigateTo(UiPageId id);
    bool Back();
    UiPageId GetActivePageId() const;
    void DispatchPageEvent(const UiPageEvent& e, bool only_active = true);
    void RegisterStatusBarWidgets(const StatusBarWidgets& w);
    void RegisterStatusBarWidgetsInLock(const StatusBarWidgets& w) { RegisterStatusBarWidgetsLocked(w); }
    void UpdateStatusBarInLock(bool update_all = false) { UpdateStatusBarLocked(update_all); }
    void ShowFactoryTestPage();
    void ShowWifiSetupPage(const std::string& ap_ssid, const std::string& web_url, const std::string& status);
    void ShowF1Page();
    bool IsFactoryTestPageActive();
    FactoryTestPageAdapter* GetFactoryTestPageAdapter() { return factory_test_page_adapter_; }

    void ShowWsOverlay(const std::string& text);
    void ShowMemeOverlay(const std::string& title, std::vector<uint8_t> png_bytes);
    bool HideWsOverlayIfVisible();
    bool IsWsOverlayVisible() const;

    void ShowRaw1bppFrame(const uint8_t* data, size_t len);
    bool HideRaw1bppFrameIfVisible();
    bool IsRaw1bppFrameVisible() const;
};

#endif  // LCD_DISPLAY_H
