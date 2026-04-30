#include <driver/gpio.h>
#include <driver/i2c_master.h>
#include <esp_adc/adc_cali.h>
#include <esp_adc/adc_cali_scheme.h>
#include <esp_adc/adc_oneshot.h>
#include <esp_log.h>
#include <esp_timer.h>

#include <memory>

#include "FT/factory_test_service.h"
#include "application.h"
#include "board.h"
#include "board_power_bsp.h"
#include "boards/common/i2c_bus_lock.h"
#include "boards/zectrix/zectrix_nfc.h"
#include "button.h"
#include "charge_status.h"
#include "codecs/es8311_audio_codec.h"
#include "config.h"
#include "custom_lcd_display.h"
#include "display/ui_page.h"
#include "display/pages/factory_test_page_adapter.h"
#include "network_interface.h"
#include "rtc_pcf8563.h"
#include "ssid_manager.h"
#include "settings.h"
#include "wifi_manager.h"
#include "ws_client_service.h"

namespace {

constexpr char kTag[] = "ZectrixFtBoard";
constexpr uint16_t kNavLongPressMs = 1000;
constexpr uint16_t kPageJumpLongPressMs = 3000;

struct WifiSetupAsyncArgs {
    CustomLcdDisplay* display = nullptr;
    std::string status;
    bool full_refresh = false;
};

struct ShowF1AsyncArgs {
    CustomLcdDisplay* display = nullptr;
};

void ShowF1Async(void* user_data) {
    auto* args = static_cast<ShowF1AsyncArgs*>(user_data);
    if (args == nullptr) {
        return;
    }
    CustomLcdDisplay* display = args->display;
    delete args;
    if (display == nullptr) {
        return;
    }
    display->ShowF1Page();
    display->RequestUrgentFullRefresh();
}

void WifiSetupAsync(void* user_data) {
    auto* args = static_cast<WifiSetupAsyncArgs*>(user_data);
    if (args == nullptr) {
        return;
    }
    CustomLcdDisplay* display = args->display;
    const std::string status = std::move(args->status);
    const bool full_refresh = args->full_refresh;
    delete args;
    if (display == nullptr) {
        return;
    }
    auto& wifi = WifiManager::GetInstance();
    display->ShowWifiSetupPage(wifi.GetApSsid(), wifi.GetApWebUrl(), status);
    if (full_refresh) {
        display->RequestUrgentFullRefresh();
    } else {
        display->RequestUrgentRefresh();
    }
}

class NullNetworkInterface : public NetworkInterface {
public:
    std::unique_ptr<Http> CreateHttp(int connect_id = -1) override {
        (void)connect_id;
        return nullptr;
    }

    std::unique_ptr<Tcp> CreateTcp(int connect_id = -1) override {
        (void)connect_id;
        return nullptr;
    }

    std::unique_ptr<Tcp> CreateSsl(int connect_id = -1) override {
        (void)connect_id;
        return nullptr;
    }

    std::unique_ptr<Udp> CreateUdp(int connect_id = -1) override {
        (void)connect_id;
        return nullptr;
    }

    std::unique_ptr<Mqtt> CreateMqtt(int connect_id = -1) override {
        (void)connect_id;
        return nullptr;
    }

    std::unique_ptr<WebSocket> CreateWebSocket(int connect_id = -1) override {
        (void)connect_id;
        return nullptr;
    }
};

class CustomBoard : public Board {
public:
    CustomBoard()
        : up_button_(TODO_UP_BUTTON_GPIO, false, kPageJumpLongPressMs, 0),
          down_button_(TODO_DOWN_BUTTON_GPIO, false, kPageJumpLongPressMs, 0),
          confirm_button_(BOOT_BUTTON_GPIO, false, kNavLongPressMs, 280) {
        InitializePower();
        InitializeI2c();
        InitializeRtc();
        InitializeNfc();
        InitializeChargeStatus();
        InitializeLcdDisplay();
        InitializeButtons();
        BindFactoryTestCallbacks();
    }

    std::string GetBoardType() override {
        return "zectrix-s3-epaper-4.2";
    }

    AudioCodec* GetAudioCodec() override {
        static Es8311AudioCodec codec(i2c_bus_,
                                      I2C_NUM_0,
                                      AUDIO_INPUT_SAMPLE_RATE,
                                      AUDIO_OUTPUT_SAMPLE_RATE,
                                      AUDIO_I2S_GPIO_MCLK,
                                      AUDIO_I2S_GPIO_BCLK,
                                      AUDIO_I2S_GPIO_WS,
                                      AUDIO_I2S_GPIO_DOUT,
                                      AUDIO_I2S_GPIO_DIN,
                                      AUDIO_CODEC_PA_PIN,
                                      AUDIO_CODEC_ES8311_ADDR);
        return &codec;
    }

    Display* GetDisplay() override {
        return display_;
    }

    NetworkInterface* GetNetwork() override {
        return &network_;
    }

    void StartNetwork() override {
    }

    bool IsFactoryTestMode() const override {
        return true;
    }

    void EnterFactoryTestFlow() override {
        if (factory_flow_started_) {
            return;
        }
        factory_flow_started_ = true;
        if (!HasSavedWifiCredentials()) {
            StartWifiOnboarding();
            return;
        }
        StartStationConnecting();
    }

    const char* GetNetworkStateIcon() override {
        return nullptr;
    }

    bool GetBatteryLevel(int& level, bool& charging, bool& discharging) override {
        ChargeStatus::Snapshot snapshot = charge_status_.Get();
        charging = snapshot.charging;
        discharging = !snapshot.power_present;

        uint16_t voltage_mv = 0;
        uint8_t percent = 0;
        const bool ok = ReadBatteryStatus(voltage_mv, percent);
        level = static_cast<int>(percent);
        return ok;
    }

    void SetPowerSaveLevel(PowerSaveLevel level) override {
        (void)level;
    }

    std::string GetBoardJson() override {
        return R"({"type":"zectrix-s3-epaper-4.2","mode":"factory_test"})";
    }

    std::string GetDeviceStatusJson() override {
        return R"({"mode":"factory_test"})";
    }

    RtcPcf8563* GetRtc() {
        return rtc_.get();
    }

    ZectrixNfc* GetNfc() {
        return nfc_.get();
    }

    ChargeStatus::Snapshot GetChargeSnapshot() const {
        return charge_status_.Get();
    }

    ChargeStatus::Snapshot RefreshChargeSnapshotForFactoryTest() {
        charge_status_.Tick(GetNowMs());
        return charge_status_.Get();
    }

    bool ReadBatteryPercentForFactoryTest(int* level) {
        if (level == nullptr) {
            return false;
        }

        uint16_t voltage_mv = 0;
        uint8_t percent = 0;
        const bool ok = ReadBatteryStatus(voltage_mv, percent);
        *level = static_cast<int>(percent);
        return ok;
    }

    void SetFactoryLedOverride(bool enabled, bool blink) {
        if (power_ != nullptr) {
            power_->SetFactoryLedOverride(enabled, blink);
        }
    }

private:
    bool HasSavedWifiCredentials() const {
        return !SsidManager::GetInstance().GetSsidList().empty();
    }

    void UpdateWifiSetupPage(const std::string& status, bool full_refresh) {
        if (display_ == nullptr) {
            return;
        }
        auto* args = new WifiSetupAsyncArgs();
        args->display = display_;
        args->status = status;
        args->full_refresh = full_refresh;
        (void)lv_async_call(WifiSetupAsync, args);
    }

    void StartWifiOnboarding() {
        if (wifi_onboarding_active_) {
            return;
        }
        wifi_onboarding_active_ = true;

        auto& wifi = WifiManager::GetInstance();
        if (!wifi.IsInitialized()) {
            WifiManagerConfig config;
            config.ssid_prefix = "GinTonic_Tip";
            config.language = "zh-CN";
            if (!wifi.Initialize(config)) {
                UpdateWifiSetupPage("状态：WiFi 初始化失败，请重启设备", true);
                return;
            }
        }

        wifi.SetEventCallback([this](WifiEvent event) {
            this->HandleWifiEvent(event);
        });
        wifi.StartConfigAp();
        UpdateWifiSetupPage("状态：已进入配网模式，等待手机连接热点", true);
    }

    void StartStationConnecting() {
        if (display_ == nullptr) {
            return;
        }
        auto& wifi = WifiManager::GetInstance();
        if (!wifi.IsInitialized()) {
            WifiManagerConfig config;
            config.ssid_prefix = "GinTonic_Tip";
            config.language = "zh-CN";
            if (!wifi.Initialize(config)) {
                UpdateWifiSetupPage("状态：WiFi 初始化失败，请重启设备", true);
                return;
            }
        }
        wifi.SetEventCallback([this](WifiEvent event) {
            this->HandleWifiEvent(event);
        });
        wifi.StartStation();
        UpdateWifiSetupPage("状态：正在连接已保存的 WiFi...", true);
    }

    void HandleWifiEvent(WifiEvent event) {
        switch (event) {
            case WifiEvent::Scanning:
                UpdateWifiSetupPage("状态：正在扫描 WiFi...", false);
                break;
            case WifiEvent::Connecting:
                UpdateWifiSetupPage("状态：正在连接 WiFi...", false);
                break;
            case WifiEvent::Connected:
                if (ws_client_ == nullptr && display_ != nullptr) {
                    ws_client_ = std::make_unique<WsClientService>(display_);
                }
                if (ws_client_ != nullptr) {
                    Settings s("websocket", false);
                    const std::string url = s.GetString("url", "");
                    ws_client_->Start(url);
                }
                if (display_ != nullptr) {
                    wifi_onboarding_active_ = false;
                    auto* args = new ShowF1AsyncArgs();
                    args->display = display_;
                    (void)lv_async_call(ShowF1Async, args);
                }
                break;
            case WifiEvent::Disconnected:
                if (ws_client_ != nullptr) {
                    ws_client_->Stop();
                }
                UpdateWifiSetupPage("状态：WiFi 已断开，正在重试...", false);
                break;
            case WifiEvent::ConfigModeEnter:
                if (ws_client_ == nullptr && display_ != nullptr) {
                    ws_client_ = std::make_unique<WsClientService>(display_);
                }
                if (ws_client_ != nullptr) {
                    Settings s("websocket", false);
                    const std::string url = s.GetString("url", "");
                    ws_client_->Start(url);
                }
                UpdateWifiSetupPage("状态：已进入配网模式，等待手机连接热点", false);
                break;
            case WifiEvent::ConfigModeExit:
                if (!HasSavedWifiCredentials()) {
                    wifi_onboarding_active_ = false;
                    StartWifiOnboarding();
                    UpdateWifiSetupPage("状态：未检测到已保存 WiFi，请重新配置", true);
                    return;
                }
                wifi_onboarding_active_ = false;
                UpdateWifiSetupPage("状态：WiFi 信息已保存，正在连接...", true);
                StartStationConnecting();
                break;
            default:
                break;
        }
    }

    static int64_t GetNowMs() {
        return esp_timer_get_time() / 1000;
    }

    bool DispatchF1(UiPageCustomEventId id) {
        if (display_ == nullptr || display_->GetActivePageId() != UiPageId::F1) {
            return false;
        }
        UiPageEvent e;
        e.type = UiPageEventType::Custom;
        e.i32 = static_cast<int32_t>(id);
        display_->DispatchPageEvent(e, true);
        display_->RequestUrgentFullRefresh();
        return true;
    }

    void ResetComboIfAllUp() {
        if (!up_down_ && !down_down_ && !confirm_down_) {
            combo_active_ = false;
            suppress_up_ = false;
            suppress_down_ = false;
            suppress_confirm_ = false;
        }
    }

    void TryCombo(int64_t now_ms) {
        constexpr int64_t kComboWindowMs = 180;
        if (combo_active_) {
            if (up_down_ && down_down_ && confirm_down_ && combo_id_ != UiPageCustomEventId::ComboAll) {
                combo_id_ = UiPageCustomEventId::ComboAll;
                suppress_up_ = true;
                suppress_down_ = true;
                suppress_confirm_ = true;
                (void)DispatchF1(combo_id_);
            }
            return;
        }

        if (up_down_ && confirm_down_ && (now_ms - std::max(up_down_ms_, confirm_down_ms_)) <= kComboWindowMs) {
            combo_active_ = true;
            combo_id_ = UiPageCustomEventId::ComboUpConfirm;
            suppress_up_ = true;
            suppress_confirm_ = true;
            (void)DispatchF1(combo_id_);
            return;
        }
        if (down_down_ && confirm_down_ && (now_ms - std::max(down_down_ms_, confirm_down_ms_)) <= kComboWindowMs) {
            combo_active_ = true;
            combo_id_ = UiPageCustomEventId::ComboDownConfirm;
            suppress_down_ = true;
            suppress_confirm_ = true;
            (void)DispatchF1(combo_id_);
            return;
        }
    }

    void InitializePower() {
        power_ = std::make_unique<BoardPowerBsp>(EPD_PWR_PIN,
                                                 Audio_PWR_PIN,
                                                 Audio_AMP_PIN,
                                                 VBAT_PWR_PIN,
                                                 &charge_status_);
        power_->VbatPowerOn();
        power_->PowerAudioOn();
        power_->PowerEpdOn();
        while (!gpio_get_level(VBAT_PWR_GPIO)) {
            vTaskDelay(pdMS_TO_TICKS(10));
        }
    }

    void InitializeI2c() {
        ScopedI2cBusLock bus_lock("CustomBoard::InitializeI2c");
        ESP_ERROR_CHECK(bus_lock.status());

        i2c_master_bus_config_t i2c_bus_cfg = {};
        i2c_bus_cfg.i2c_port = static_cast<i2c_port_t>(0);
        i2c_bus_cfg.sda_io_num = AUDIO_CODEC_I2C_SDA_PIN;
        i2c_bus_cfg.scl_io_num = AUDIO_CODEC_I2C_SCL_PIN;
        i2c_bus_cfg.clk_source = I2C_CLK_SRC_DEFAULT;
        i2c_bus_cfg.glitch_ignore_cnt = 7;
        i2c_bus_cfg.intr_priority = 0;
        i2c_bus_cfg.trans_queue_depth = 0;
        i2c_bus_cfg.flags.enable_internal_pullup = 1;
        ESP_ERROR_CHECK(i2c_new_master_bus(&i2c_bus_cfg, &i2c_bus_));
    }

    void InitializeRtc() {
        rtc_ = std::make_unique<RtcPcf8563>(i2c_bus_, RTC_I2C_ADDR);
        if (!rtc_->Init(RTC_INT_GPIO)) {
            ESP_LOGW(kTag, "RTC init failed");
        }
    }

    void InitializeNfc() {
        nfc_ = std::make_unique<ZectrixNfc>(i2c_bus_,
                                            NFC_I2C_ADDR,
                                            NFC_PWR_GPIO,
                                            NFC_FD_GPIO,
                                            NFC_FD_ACTIVE_LEVEL);
        if (!nfc_->Init()) {
            ESP_LOGW(kTag, "NFC init failed");
            nfc_.reset();
        }
    }

    void InitializeChargeStatus() {
        charge_status_.Init(CHARGE_DETECT_GPIO, CHARGE_FULL_GPIO, GetNowMs());
    }

    void InitializeLcdDisplay() {
        custom_lcd_spi_t lcd_spi_data = {};
        lcd_spi_data.cs = EPD_CS_PIN;
        lcd_spi_data.dc = EPD_DC_PIN;
        lcd_spi_data.rst = EPD_RST_PIN;
        lcd_spi_data.busy = EPD_BUSY_PIN;
        lcd_spi_data.mosi = EPD_MOSI_PIN;
        lcd_spi_data.scl = EPD_SCK_PIN;
        lcd_spi_data.power = EPD_PWR_PIN;
        lcd_spi_data.spi_host = EPD_SPI_NUM;
        lcd_spi_data.buffer_len = ((EXAMPLE_LCD_WIDTH + 7) / 8) * EXAMPLE_LCD_HEIGHT;
        display_ = new CustomLcdDisplay(nullptr,
                                        nullptr,
                                        EXAMPLE_LCD_WIDTH,
                                        EXAMPLE_LCD_HEIGHT,
                                        DISPLAY_OFFSET_X,
                                        DISPLAY_OFFSET_Y,
                                        DISPLAY_MIRROR_X,
                                        DISPLAY_MIRROR_Y,
                                        DISPLAY_SWAP_XY,
                                        lcd_spi_data);
    }

    void InitializeButtons() {
        up_button_.OnPressDown([this]() {
            const int64_t now = GetNowMs();
            up_down_ = true;
            up_down_ms_ = now;
            TryCombo(now);
        });
        up_button_.OnPressUp([this]() {
            up_down_ = false;
            ResetComboIfAllUp();
        });

        down_button_.OnPressDown([this]() {
            const int64_t now = GetNowMs();
            down_down_ = true;
            down_down_ms_ = now;
            TryCombo(now);
        });
        down_button_.OnPressUp([this]() {
            down_down_ = false;
            ResetComboIfAllUp();
        });

        confirm_button_.OnPressDown([this]() {
            const int64_t now = GetNowMs();
            confirm_down_ = true;
            confirm_down_ms_ = now;
            TryCombo(now);
        });
        confirm_button_.OnPressUp([this]() {
            confirm_down_ = false;
            ResetComboIfAllUp();
        });

        up_button_.OnClick([this]() {
            if (suppress_up_) {
                return;
            }
            if (display_ != nullptr && display_->IsWsOverlayVisible()) {
                return;
            }
            if (display_ != nullptr && display_->GetActivePageId() == UiPageId::F1) {
                UiPageEvent e;
                e.type = UiPageEventType::Custom;
                e.i32 = static_cast<int32_t>(UiPageCustomEventId::PagePrev);
                display_->DispatchPageEvent(e, true);
                return;
            }
            FactoryTestService::Instance().HandleButton(FactoryTestButton::kUpClick);
        });
        up_button_.OnLongPress([this]() {
            if (suppress_up_) {
                return;
            }
            if (display_ != nullptr && display_->IsWsOverlayVisible()) {
                return;
            }
            if (down_down_) {
                combo_active_ = true;
                combo_id_ = UiPageCustomEventId::ComboUpDown;
                suppress_up_ = true;
                suppress_down_ = true;
                (void)DispatchF1(combo_id_);
                return;
            }
            if (display_ != nullptr && display_->GetActivePageId() == UiPageId::F1) {
                UiPageEvent e;
                e.type = UiPageEventType::Custom;
                e.i32 = static_cast<int32_t>(UiPageCustomEventId::JumpOffWeek);
                display_->DispatchPageEvent(e, true);
                display_->RequestUrgentFullRefresh();
                return;
            }
        });

        down_button_.OnClick([this]() {
            if (suppress_down_) {
                return;
            }
            if (display_ != nullptr && display_->IsWsOverlayVisible()) {
                return;
            }
            if (display_ != nullptr && display_->GetActivePageId() == UiPageId::F1) {
                UiPageEvent e;
                e.type = UiPageEventType::Custom;
                e.i32 = static_cast<int32_t>(UiPageCustomEventId::PageNext);
                display_->DispatchPageEvent(e, true);
                return;
            }
            FactoryTestService::Instance().HandleButton(FactoryTestButton::kDownClick);
        });
        down_button_.OnLongPress([this]() {
            if (suppress_down_) {
                return;
            }
            if (display_ != nullptr && display_->IsWsOverlayVisible()) {
                return;
            }
            if (up_down_) {
                combo_active_ = true;
                combo_id_ = UiPageCustomEventId::ComboUpDown;
                suppress_up_ = true;
                suppress_down_ = true;
                (void)DispatchF1(combo_id_);
                return;
            }
            if (display_ != nullptr && display_->GetActivePageId() == UiPageId::F1) {
                UiPageEvent e;
                e.type = UiPageEventType::Custom;
                e.i32 = static_cast<int32_t>(UiPageCustomEventId::JumpRaceDay);
                display_->DispatchPageEvent(e, true);
                display_->RequestUrgentFullRefresh();
                return;
            }
        });

        confirm_button_.OnClick([this]() {
            if (suppress_confirm_) {
                return;
            }
            if (display_ != nullptr && display_->HideRaw1bppFrameIfVisible()) {
                display_->RequestUrgentFullRefresh();
                return;
            }
            if (display_ != nullptr && display_->HideWsOverlayIfVisible()) {
                display_->RequestUrgentFullRefresh();
                return;
            }
            if (display_ != nullptr && display_->GetActivePageId() == UiPageId::F1) {
                UiPageEvent e;
                e.type = UiPageEventType::Custom;
                e.i32 = static_cast<int32_t>(UiPageCustomEventId::ConfirmClick);
                display_->DispatchPageEvent(e, true);
                display_->RequestUrgentFullRefresh();
                return;
            }
            FactoryTestService::Instance().HandleButton(FactoryTestButton::kConfirmClick);
        });

        confirm_button_.OnDoubleClick([this]() {
            if (suppress_confirm_) {
                return;
            }
            if (display_ != nullptr && display_->IsWsOverlayVisible()) {
                return;
            }
            if (display_ != nullptr && display_->GetActivePageId() == UiPageId::F1) {
                UiPageEvent e;
                e.type = UiPageEventType::Custom;
                e.i32 = static_cast<int32_t>(UiPageCustomEventId::ConfirmDoubleClick);
                display_->DispatchPageEvent(e, true);
                display_->RequestUrgentFullRefresh();
                return;
            }
        });

        confirm_button_.OnLongPress([this]() {
            if (suppress_confirm_) {
                return;
            }
            if (display_ != nullptr && display_->IsWsOverlayVisible()) {
                return;
            }
            if (display_ != nullptr && display_->GetActivePageId() == UiPageId::WifiSetup) {
                if (display_->Back()) {
                    display_->RequestUrgentFullRefresh();
                    return;
                }
            }
            if (display_ != nullptr && display_->GetActivePageId() == UiPageId::F1) {
                UiPageEvent e;
                e.type = UiPageEventType::Custom;
                e.i32 = static_cast<int32_t>(UiPageCustomEventId::ConfirmLongPress);
                display_->DispatchPageEvent(e, true);
                display_->RequestUrgentFullRefresh();
                return;
            }
            FactoryTestService::Instance().HandleButton(FactoryTestButton::kConfirmLongPress);
        });
    }

    void BindFactoryTestCallbacks() {
        auto& factory_test = FactoryTestService::Instance();
        factory_test.SetSnapshotCallback([this](const FactoryTestSnapshot& snapshot) {
            if (display_ == nullptr) {
                return;
            }

            auto* page = display_->GetFactoryTestPageAdapter();
            if (page == nullptr) {
                return;
            }

            DisplayLockGuard lock(display_);
            page->UpdateSnapshot(snapshot);
            display_->RequestUrgentRefresh();
        });

        factory_test.SetShutdownCallback([this]() {
            if (power_ != nullptr) {
                power_->VbatPowerOff();
            }
        });
    }

    uint16_t ReadBatteryVoltage() {
        static bool initialized = false;
        static adc_oneshot_unit_handle_t adc_handle = nullptr;
        static adc_cali_handle_t cali_handle = nullptr;

        if (!initialized) {
            adc_oneshot_unit_init_cfg_t init_config = {
                .unit_id = ADC_UNIT_1,
                .ulp_mode = ADC_ULP_MODE_DISABLE,
            };
            ESP_ERROR_CHECK(adc_oneshot_new_unit(&init_config, &adc_handle));

            adc_oneshot_chan_cfg_t ch_config = {
                .atten = ADC_ATTEN_DB_12,
                .bitwidth = ADC_BITWIDTH_12,
            };
            ESP_ERROR_CHECK(adc_oneshot_config_channel(adc_handle, ADC_CHANNEL_3, &ch_config));

            adc_cali_curve_fitting_config_t cali_config = {
                .unit_id = ADC_UNIT_1,
                .chan = ADC_CHANNEL_3,
                .atten = ADC_ATTEN_DB_12,
                .bitwidth = ADC_BITWIDTH_12,
            };
            if (adc_cali_create_scheme_curve_fitting(&cali_config, &cali_handle) == ESP_OK) {
                initialized = true;
            }
        }

        if (!initialized) {
            return 0;
        }

        int raw_value = 0;
        int raw_voltage = 0;
        ESP_ERROR_CHECK(adc_oneshot_read(adc_handle, ADC_CHANNEL_3, &raw_value));
        ESP_ERROR_CHECK(adc_cali_raw_to_voltage(cali_handle, raw_value, &raw_voltage));
        return static_cast<uint16_t>(raw_voltage * 2);
    }

    bool ReadBatteryStatus(uint16_t& voltage_mv, uint8_t& percent) {
        int voltage_sum = 0;
        for (int i = 0; i < 10; ++i) {
            voltage_sum += ReadBatteryVoltage();
        }

        const int average_voltage = voltage_sum / 10;
        if (average_voltage <= 0) {
            voltage_mv = 0;
            percent = 0;
            return false;
        }

        int computed_percent =
            (-1 * average_voltage * average_voltage + 9016 * average_voltage - 19189000) / 10000;
        computed_percent = computed_percent > 100 ? 100 : (computed_percent < 0 ? 0 : computed_percent);

        voltage_mv = static_cast<uint16_t>(average_voltage);
        percent = static_cast<uint8_t>(computed_percent);
        return true;
    }

    NullNetworkInterface network_;
    CustomLcdDisplay* display_ = nullptr;
    std::unique_ptr<BoardPowerBsp> power_;
    i2c_master_bus_handle_t i2c_bus_ = nullptr;
    std::unique_ptr<RtcPcf8563> rtc_;
    std::unique_ptr<ZectrixNfc> nfc_;
    std::unique_ptr<WsClientService> ws_client_;
    ChargeStatus charge_status_;
    Button up_button_;
    Button down_button_;
    Button confirm_button_;

    bool up_down_ = false;
    bool down_down_ = false;
    bool confirm_down_ = false;
    int64_t up_down_ms_ = 0;
    int64_t down_down_ms_ = 0;
    int64_t confirm_down_ms_ = 0;
    bool combo_active_ = false;
    UiPageCustomEventId combo_id_ = UiPageCustomEventId::ComboUpDown;
    bool suppress_up_ = false;
    bool suppress_down_ = false;
    bool suppress_confirm_ = false;
    bool wifi_onboarding_active_ = false;
    bool factory_flow_started_ = false;
};

}  // namespace

DECLARE_BOARD(CustomBoard);

extern "C" void BoardOnNetworkConnected() {
}

extern "C" void BoardOnNetworkDisconnected() {
}

extern "C" RtcPcf8563* ZectrixGetRtc() {
    auto& board = static_cast<CustomBoard&>(Board::GetInstance());
    return board.GetRtc();
}

extern "C" ChargeStatus::Snapshot ZectrixGetChargeSnapshot() {
    auto& board = static_cast<CustomBoard&>(Board::GetInstance());
    return board.GetChargeSnapshot();
}

extern "C" ChargeStatus::Snapshot ZectrixRefreshChargeSnapshotForFactoryTest() {
    auto& board = static_cast<CustomBoard&>(Board::GetInstance());
    return board.RefreshChargeSnapshotForFactoryTest();
}

extern "C" bool ZectrixReadBatteryPercentForFactoryTest(int* level) {
    auto& board = static_cast<CustomBoard&>(Board::GetInstance());
    return board.ReadBatteryPercentForFactoryTest(level);
}

extern "C" void ZectrixSetFactoryLedOverride(bool enabled, bool blink) {
    auto& board = static_cast<CustomBoard&>(Board::GetInstance());
    board.SetFactoryLedOverride(enabled, blink);
}

extern "C" ZectrixNfc* ZectrixGetNfc() {
    auto& board = static_cast<CustomBoard&>(Board::GetInstance());
    return board.GetNfc();
}
