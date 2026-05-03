#include "lcd_display.h"

#include "lvgl_theme.h"
#include "board.h"
#include "pages/meme_page_adapter.h"
#include "pages/f1_page_adapter.h"
#include "pages/breaking_news_page_adapter.h"
#include "pages/factory_test_page_adapter.h"
#include "pages/wifi_setup_page_adapter.h"
#include "settings.h"

#include <esp_log.h>
#include <esp_lvgl_port.h>
#include <font_zectrix.h>

#include <algorithm>
#include <ctime>

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

void LcdDisplay::RegisterStatusBarWidgetsLocked(const StatusBarWidgets& w) {
    const bool has_any = w.time != nullptr || w.date != nullptr || w.batt_icon != nullptr || w.batt_pct != nullptr;
    if (!has_any) {
        return;
    }
    for (const auto& it : status_bar_widgets_) {
        if (it.time == w.time && it.date == w.date && it.batt_icon == w.batt_icon && it.batt_pct == w.batt_pct) {
            return;
        }
    }
    status_bar_widgets_.push_back(w);
}

void LcdDisplay::RegisterStatusBarWidgets(const StatusBarWidgets& w) {
    DisplayLockGuard lock(this);
    RegisterStatusBarWidgetsLocked(w);
}

void LcdDisplay::UpdateStatusBarLocked(bool update_all) {
    const int64_t now_ms = esp_timer_get_time() / 1000;
    if (!update_all && status_bar_last_update_ms_ > 0 && (now_ms - status_bar_last_update_ms_) < 1000) {
        return;
    }
    status_bar_last_update_ms_ = now_ms;

    auto& board = Board::GetInstance();
    int level = 0;
    bool charging = false;
    bool discharging = false;
    const bool ok_batt = board.GetBatteryLevel(level, charging, discharging);
    level = std::clamp(level, 0, 100);

    const char* batt_icon = "";
    if (charging) {
        batt_icon = FONT_ZECTRIX_BATTERY_CHARGING;
    } else if (level >= 90) {
        batt_icon = FONT_ZECTRIX_BATTERY_FULL;
    } else if (level >= 65) {
        batt_icon = FONT_ZECTRIX_BATTERY_75;
    } else if (level >= 40) {
        batt_icon = FONT_ZECTRIX_BATTERY_50;
    } else if (level >= 15) {
        batt_icon = FONT_ZECTRIX_BATTERY_25;
    } else {
        batt_icon = FONT_ZECTRIX_BATTERY_EMPTY;
    }

    char batt_pct_buf[8] = {};
    if (ok_batt) {
        snprintf(batt_pct_buf, sizeof(batt_pct_buf), "%d%%", level);
    } else {
        snprintf(batt_pct_buf, sizeof(batt_pct_buf), "--%%");
    }

    char time_buf[16] = "--:--";
    char date_buf[32] = "--";
    {
        time_t now_s = 0;
        time(&now_s);
        tm local_tm = {};
        if (now_s > 1600000000 && localtime_r(&now_s, &local_tm) != nullptr) {
            snprintf(time_buf, sizeof(time_buf), "%02d:%02d", local_tm.tm_hour, local_tm.tm_min);
            (void)strftime(date_buf, sizeof(date_buf), "%a %b %d, %Y", &local_tm);
        }
    }

    for (auto it = status_bar_widgets_.begin(); it != status_bar_widgets_.end();) {
        const StatusBarWidgets w = *it;
        const bool valid =
            (w.time == nullptr || lv_obj_is_valid(w.time)) &&
            (w.date == nullptr || lv_obj_is_valid(w.date)) &&
            (w.batt_icon == nullptr || lv_obj_is_valid(w.batt_icon)) &&
            (w.batt_pct == nullptr || lv_obj_is_valid(w.batt_pct));
        if (!valid) {
            it = status_bar_widgets_.erase(it);
            continue;
        }
        if (w.time != nullptr) {
            lv_label_set_text(w.time, time_buf);
        }
        if (w.date != nullptr) {
            lv_label_set_text(w.date, date_buf);
        }
        if (w.batt_icon != nullptr) {
            lv_label_set_text(w.batt_icon, batt_icon);
        }
        if (w.batt_pct != nullptr) {
            lv_label_set_text(w.batt_pct, batt_pct_buf);
        }
        ++it;
    }
}

void LcdDisplay::UpdateStatusBar(bool update_all) {
    SetupUI();
    DisplayLockGuard lock(this);
    UpdateStatusBarLocked(update_all);
}

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
        breaking_news_page_adapter_ = nullptr;
        meme_page_adapter_ = nullptr;
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
        if (breaking_news_screen_ != nullptr) {
            lv_obj_del(breaking_news_screen_);
            breaking_news_screen_ = nullptr;
        }
        if (meme_screen_ != nullptr) {
            lv_obj_del(meme_screen_);
            meme_screen_ = nullptr;
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

bool LcdDisplay::NavigateToLocked(UiPageId id) {
    if (page_stack_.empty()) {
        page_stack_.push_back(id);
    } else if (page_stack_.back() != id) {
        page_stack_.push_back(id);
    }
    return SwitchPageLocked(id);
}

bool LcdDisplay::NavigateTo(UiPageId id) {
    DisplayLockGuard lock(this);
    return NavigateToLocked(id);
}

bool LcdDisplay::BackLocked() {
    if (page_stack_.size() <= 1) {
        return false;
    }
    page_stack_.pop_back();
    return SwitchPageLocked(page_stack_.back());
}

bool LcdDisplay::Back() {
    DisplayLockGuard lock(this);
    return BackLocked();
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
    if (breaking_news_page_adapter_ != nullptr) {
        breaking_news_page_adapter_->UpdateText(text);
    }
    (void)NavigateToLocked(UiPageId::BreakingNews);
}

void LcdDisplay::ShowMemeOverlay(const std::string& title, std::vector<uint8_t> png_bytes) {
    SetupUI();
    DisplayLockGuard lock(this);
    if (meme_page_adapter_ != nullptr) {
        meme_page_adapter_->Update(title, std::move(png_bytes));
    }
    (void)NavigateToLocked(UiPageId::Meme);
}

bool LcdDisplay::HideWsOverlayIfVisible() {
    DisplayLockGuard lock(this);
    if (page_registry_.HasActive() && page_registry_.ActiveId() == UiPageId::BreakingNews) {
        return BackLocked();
    }
    if (page_registry_.HasActive() && page_registry_.ActiveId() == UiPageId::Meme) {
        return BackLocked();
    }
    return false;
}

bool LcdDisplay::IsWsOverlayVisible() const {
    DisplayLockGuard lock(const_cast<LcdDisplay*>(this));
    return page_registry_.HasActive() &&
        (page_registry_.ActiveId() == UiPageId::BreakingNews || page_registry_.ActiveId() == UiPageId::Meme);
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
    (void)NavigateTo(UiPageId::FactoryTest);
}

void LcdDisplay::ShowWifiSetupPage(const std::string& ap_ssid,
                                   const std::string& web_url,
                                   const std::string& status) {
    SetupUI();
    DisplayLockGuard lock(this);
    if (wifi_setup_page_adapter_ != nullptr) {
        wifi_setup_page_adapter_->UpdateInfo(ap_ssid, web_url, status);
    }
    (void)NavigateToLocked(UiPageId::WifiSetup);
}

void LcdDisplay::ShowF1Page() {
    SetupUI();
    (void)NavigateTo(UiPageId::F1);
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

    auto breaking = std::make_unique<BreakingNewsPageAdapter>(this);
    breaking_news_page_adapter_ = breaking.get();
    if (!RegisterPageLocked(std::move(breaking))) {
        breaking_news_page_adapter_ = nullptr;
        return;
    }

    auto meme = std::make_unique<MemePageAdapter>(this);
    meme_page_adapter_ = meme.get();
    if (!RegisterPageLocked(std::move(meme))) {
        meme_page_adapter_ = nullptr;
        return;
    }

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
