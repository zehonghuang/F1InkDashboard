#include "lcd_display.h"

#include "lvgl_theme.h"
#include "pages/f1_page_adapter.h"
#include "pages/factory_test_page_adapter.h"
#include "pages/wifi_setup_page_adapter.h"
#include "settings.h"

#include <esp_log.h>
#include <esp_lvgl_port.h>
#include <font_zectrix.h>

LV_FONT_DECLARE(BUILTIN_TEXT_FONT);
LV_FONT_DECLARE(BUILTIN_ICON_FONT);
LV_FONT_DECLARE(font_zectrix_48_1);
LV_FONT_DECLARE(SourceHanSansSC_Medium_slim);

namespace {

constexpr char kTag[] = "LcdDisplay";

void InitializeLcdThemes() {
    static bool initialized = false;
    if (initialized) {
        return;
    }

    auto text_font = std::make_shared<LvglBuiltInFont>(&BUILTIN_TEXT_FONT);
    auto icon_font = std::make_shared<LvglBuiltInFont>(&BUILTIN_ICON_FONT);
    auto large_icon_font = std::make_shared<LvglBuiltInFont>(&font_zectrix_48_1);
    auto reminder_font = std::make_shared<LvglBuiltInFont>(&SourceHanSansSC_Medium_slim);

    auto* light_theme = new LvglTheme("light");
    light_theme->set_background_color(lv_color_hex(0xFFFFFF));
    light_theme->set_text_color(lv_color_hex(0x000000));
    light_theme->set_border_color(lv_color_hex(0x000000));
    light_theme->set_low_battery_color(lv_color_hex(0x000000));
    light_theme->set_text_font(text_font);
    light_theme->set_reminder_text_font(reminder_font);
    light_theme->set_icon_font(icon_font);
    light_theme->set_large_icon_font(large_icon_font);

    auto* dark_theme = new LvglTheme("dark");
    dark_theme->set_background_color(lv_color_hex(0x000000));
    dark_theme->set_text_color(lv_color_hex(0xFFFFFF));
    dark_theme->set_border_color(lv_color_hex(0xFFFFFF));
    dark_theme->set_low_battery_color(lv_color_hex(0xFFFFFF));
    dark_theme->set_text_font(text_font);
    dark_theme->set_reminder_text_font(reminder_font);
    dark_theme->set_icon_font(icon_font);
    dark_theme->set_large_icon_font(large_icon_font);

    auto& theme_manager = LvglThemeManager::GetInstance();
    theme_manager.RegisterTheme("light", light_theme);
    theme_manager.RegisterTheme("dark", dark_theme);
    initialized = true;
}

}  // namespace

LcdDisplay::LcdDisplay(esp_lcd_panel_io_handle_t panel_io,
                       esp_lcd_panel_handle_t panel,
                       int width,
                       int height)
    : panel_io_(panel_io), panel_(panel) {
    width_ = width;
    height_ = height;

    InitializeLcdThemes();

    Settings settings("display", false);
    std::string theme_name = settings.GetString("theme", "light");
    current_theme_ = LvglThemeManager::GetInstance().GetTheme(theme_name);
    if (current_theme_ == nullptr) {
        current_theme_ = LvglThemeManager::GetInstance().GetTheme("light");
    }
}

LcdDisplay::~LcdDisplay() {
    {
        DisplayLockGuard lock(this);
        page_registry_.Reset();
        factory_test_page_adapter_ = nullptr;
        wifi_setup_page_adapter_ = nullptr;
        f1_page_adapter_ = nullptr;
        ui_setup_done_ = false;
        if (factory_test_screen_ != nullptr) {
            lv_obj_del(factory_test_screen_);
            factory_test_screen_ = nullptr;
        }
        if (wifi_setup_screen_ != nullptr) {
            lv_obj_del(wifi_setup_screen_);
            wifi_setup_screen_ = nullptr;
        }
        if (f1_screen_ != nullptr) {
            lv_obj_del(f1_screen_);
            f1_screen_ = nullptr;
        }
    }

    if (display_ != nullptr) {
        lv_display_delete(display_);
        display_ = nullptr;
    }
    if (panel_ != nullptr) {
        esp_lcd_panel_del(panel_);
        panel_ = nullptr;
    }
    if (panel_io_ != nullptr) {
        esp_lcd_panel_io_del(panel_io_);
        panel_io_ = nullptr;
    }
}

bool LcdDisplay::Lock(int timeout_ms) {
    return lvgl_port_lock(timeout_ms);
}

void LcdDisplay::Unlock() {
    lvgl_port_unlock();
}

void LcdDisplay::ShowScreen(lv_obj_t* scr) {
    if (scr != nullptr) {
        lv_screen_load(scr);
    }
}

bool LcdDisplay::RegisterPageLocked(std::unique_ptr<IUiPage> page) {
    return page_registry_.Register(std::move(page));
}

bool LcdDisplay::RegisterPage(std::unique_ptr<IUiPage> page) {
    DisplayLockGuard lock(this);
    return RegisterPageLocked(std::move(page));
}

bool LcdDisplay::SwitchPageLocked(UiPageId id) {
    const bool same_page = page_registry_.HasActive() && page_registry_.ActiveId() == id;
    if (!same_page && HasPicContent()) {
        ClearPic();
    }
    const bool ok = page_registry_.SwitchTo(id);
    if (ok && lv_screen_active() != nullptr) {
        lv_obj_invalidate(lv_screen_active());
    }
    return ok;
}

bool LcdDisplay::SwitchPage(UiPageId id) {
    DisplayLockGuard lock(this);
    return SwitchPageLocked(id);
}

UiPageId LcdDisplay::GetActivePageId() const {
    DisplayLockGuard lock(const_cast<LcdDisplay*>(this));
    return page_registry_.ActiveId();
}

void LcdDisplay::DispatchPageEvent(const UiPageEvent& e, bool only_active) {
    DisplayLockGuard lock(this);
    page_registry_.Dispatch(e, only_active);
}

void LcdDisplay::ShowWsOverlay(const std::string& text) {
    SetupUI();
    DisplayLockGuard lock(this);
    if (ws_overlay_root_ == nullptr || ws_overlay_label_ == nullptr) {
        return;
    }
    lv_label_set_text(ws_overlay_label_, text.c_str());
    lv_obj_clear_flag(ws_overlay_root_, LV_OBJ_FLAG_HIDDEN);
    ws_overlay_visible_ = true;
}

bool LcdDisplay::HideWsOverlayIfVisible() {
    DisplayLockGuard lock(this);
    if (!ws_overlay_visible_ || ws_overlay_root_ == nullptr) {
        return false;
    }
    lv_obj_add_flag(ws_overlay_root_, LV_OBJ_FLAG_HIDDEN);
    ws_overlay_visible_ = false;
    return true;
}

bool LcdDisplay::IsWsOverlayVisible() const {
    DisplayLockGuard lock(const_cast<LcdDisplay*>(this));
    return ws_overlay_visible_;
}

void LcdDisplay::ShowRaw1bppFrame(const uint8_t* data, size_t len) {
    if (data == nullptr || len == 0) {
        return;
    }
    DisplayLockGuard lock(this);
    const int w = width();
    const int h = height();
    const size_t expected = static_cast<size_t>((w + 7) >> 3) * static_cast<size_t>(h);
    if (len != expected) {
        ESP_LOGW(kTag, "raw1bpp size mismatch got=%u exp=%u",
                 static_cast<unsigned>(len),
                 static_cast<unsigned>(expected));
        return;
    }
    SetRaw1bppMode(true);
    WriteRaw1bpp(0, 0, w, h, data, len);
    raw_1bpp_visible_ = true;
    RequestUrgentFullRefresh();
}

bool LcdDisplay::HideRaw1bppFrameIfVisible() {
    DisplayLockGuard lock(this);
    if (!raw_1bpp_visible_) {
        return false;
    }
    raw_1bpp_visible_ = false;
    SetRaw1bppMode(false);
    if (lv_screen_active() != nullptr) {
        lv_obj_invalidate(lv_screen_active());
    }
    RequestUrgentFullRefresh();
    return true;
}

bool LcdDisplay::IsRaw1bppFrameVisible() const {
    DisplayLockGuard lock(const_cast<LcdDisplay*>(this));
    return raw_1bpp_visible_;
}

void LcdDisplay::ShowFactoryTestPage() {
    SetupUI();
    (void)SwitchPage(UiPageId::FactoryTest);
}

void LcdDisplay::ShowWifiSetupPage(const std::string& ap_ssid,
                                   const std::string& web_url,
                                   const std::string& status) {
    SetupUI();
    DisplayLockGuard lock(this);
    if (wifi_setup_page_adapter_ != nullptr) {
        wifi_setup_page_adapter_->UpdateInfo(ap_ssid, web_url, status);
    }
    (void)SwitchPageLocked(UiPageId::WifiSetup);
}

void LcdDisplay::ShowF1Page() {
    SetupUI();
    (void)SwitchPage(UiPageId::F1);
}

bool LcdDisplay::IsFactoryTestPageActive() {
    DisplayLockGuard lock(this);
    return page_registry_.HasActive() && page_registry_.ActiveId() == UiPageId::FactoryTest;
}

void LcdDisplay::SetupUI() {
    DisplayLockGuard lock(this);
    if (ui_setup_done_) {
        return;
    }

    auto factory_test_page = std::make_unique<FactoryTestPageAdapter>(this);
    factory_test_page_adapter_ = factory_test_page.get();
    if (!RegisterPageLocked(std::move(factory_test_page))) {
        factory_test_page_adapter_ = nullptr;
        return;
    }

    auto wifi_setup_page = std::make_unique<WifiSetupPageAdapter>(this);
    wifi_setup_page_adapter_ = wifi_setup_page.get();
    if (!RegisterPageLocked(std::move(wifi_setup_page))) {
        wifi_setup_page_adapter_ = nullptr;
        return;
    }

    auto f1_page = std::make_unique<F1PageAdapter>(this);
    f1_page_adapter_ = f1_page.get();
    if (!RegisterPageLocked(std::move(f1_page))) {
        f1_page_adapter_ = nullptr;
        return;
    }

    if (!SwitchPageLocked(UiPageId::FactoryTest)) {
        ESP_LOGW(kTag, "Failed to switch to FT page");
        return;
    }

    ws_overlay_root_ = lv_obj_create(lv_layer_top());
    lv_obj_set_size(ws_overlay_root_, width_, height_);
    lv_obj_align(ws_overlay_root_, LV_ALIGN_TOP_LEFT, 0, 0);
    lv_obj_set_style_bg_color(ws_overlay_root_, lv_color_hex(0xFFFFFF), 0);
    lv_obj_set_style_bg_opa(ws_overlay_root_, LV_OPA_COVER, 0);
    lv_obj_set_style_border_width(ws_overlay_root_, 0, 0);
    lv_obj_set_style_pad_all(ws_overlay_root_, 12, 0);
    ws_overlay_label_ = lv_label_create(ws_overlay_root_);
    lv_obj_set_width(ws_overlay_label_, width_ - 24);
    lv_label_set_long_mode(ws_overlay_label_, LV_LABEL_LONG_WRAP);
    lv_obj_align(ws_overlay_label_, LV_ALIGN_CENTER, 0, 0);
    lv_obj_set_style_text_color(ws_overlay_label_, lv_color_hex(0x000000), 0);
    lv_obj_set_style_text_font(ws_overlay_label_, &BUILTIN_TEXT_FONT, 0);
    lv_label_set_text(ws_overlay_label_, "");
    lv_obj_add_flag(ws_overlay_root_, LV_OBJ_FLAG_HIDDEN);
    ws_overlay_visible_ = false;

    ui_setup_done_ = true;
}

void LcdDisplay::SetEmotion(const char* emotion) {
    (void)emotion;
}

void LcdDisplay::SetChatMessage(const char* role, const char* content) {
    (void)role;
    (void)content;
}

void LcdDisplay::SetPreviewImage(std::unique_ptr<LvglImage> image) {
    (void)image;
}

void LcdDisplay::SetTheme(Theme* theme) {
    Display::SetTheme(theme);
}
