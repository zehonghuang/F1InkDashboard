#include "factory_test_service.h"

#include "acoustic_selftest.h"

#include "application.h"
#include "audio_codec.h"
#include "board.h"
#include "i18n.h"
#include "boards/zectrix-s3-epaper-4.2/charge_status.h"
#include "boards/zectrix-s3-epaper-4.2/config.h"
#include "boards/zectrix-s3-epaper-4.2/rtc_pcf8563.h"
#include "boards/zectrix/zectrix_nfc.h"

#include <driver/gpio.h>
#include <esp_log.h>
#include <esp_mac.h>
#include <esp_netif.h>
#include <esp_timer.h>
#include <esp_wifi.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include <wifi_manager.h>

#include <algorithm>
#include <array>
#include <cstdarg>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

extern "C" RtcPcf8563* ZectrixGetRtc();
extern "C" ChargeStatus::Snapshot ZectrixGetChargeSnapshot();
extern "C" ChargeStatus::Snapshot ZectrixRefreshChargeSnapshotForFactoryTest();
extern "C" bool ZectrixReadBatteryPercentForFactoryTest(int* level);
extern "C" void ZectrixSetFactoryLedOverride(bool enabled, bool blink);
extern "C" ZectrixNfc* ZectrixGetNfc();

namespace {

const char* const TAG = "FactoryTest";
constexpr const char* kRfTargetSsid = "Yoxintech";
constexpr int kRfThresholdDbm = -70;
constexpr int kRfPassCount = 3;
constexpr TickType_t kRfRetryDelayTicks = pdMS_TO_TICKS(800);
constexpr TickType_t kAudioRetryDelayTicks = pdMS_TO_TICKS(1200);
constexpr TickType_t kRtcRetryDelayTicks = pdMS_TO_TICKS(1000);
constexpr TickType_t kRtcPollTicks = pdMS_TO_TICKS(200);
constexpr TickType_t kChargePollTicks = pdMS_TO_TICKS(300);
constexpr TickType_t kOperatorWaitTicks = pdMS_TO_TICKS(250);
constexpr TickType_t kKeyRetryDelayTicks = pdMS_TO_TICKS(900);
constexpr TickType_t kNfcRetryDelayTicks = pdMS_TO_TICKS(800);
constexpr TickType_t kNfcPollTicks = pdMS_TO_TICKS(200);
constexpr int kFactoryTestVolume = 80;
constexpr uint32_t kButtonConfirmClick = 1u << 0;
constexpr uint32_t kButtonConfirmLong = 1u << 1;
constexpr uint32_t kButtonUpClick = 1u << 2;
constexpr uint32_t kButtonDownClick = 1u << 3;
constexpr int kRtcStartHour = 8;
constexpr int kRtcStartMinute = 0;
constexpr int kRtcStartSecond = 0;
constexpr int kRtcTestDurationSeconds = 5;
constexpr int64_t kRtcTimeoutUs = 7000000LL;

TaskHandle_t g_factory_test_task = nullptr;

int StepIndex(FactoryTestStep step) {
    switch (step) {
        case FactoryTestStep::kRf:
            return 0;
        case FactoryTestStep::kAudio:
            return 1;
        case FactoryTestStep::kRtc:
            return 2;
        case FactoryTestStep::kCharge:
            return 3;
        case FactoryTestStep::kLed:
            return 4;
        case FactoryTestStep::kKeys:
            return 5;
        case FactoryTestStep::kNfc:
            return 6;
        default:
            return -1;
    }
}

const char* StepTitle(FactoryTestStep step) {
    switch (step) {
        case FactoryTestStep::kRf:
            return I18n::Tr("factory_test.step_title.rf");
        case FactoryTestStep::kAudio:
            return I18n::Tr("factory_test.step_title.audio");
        case FactoryTestStep::kRtc:
            return I18n::Tr("factory_test.step_title.rtc");
        case FactoryTestStep::kCharge:
            return I18n::Tr("factory_test.step_title.charge");
        case FactoryTestStep::kLed:
            return I18n::Tr("factory_test.step_title.led");
        case FactoryTestStep::kKeys:
            return I18n::Tr("factory_test.step_title.keys");
        case FactoryTestStep::kNfc:
            return I18n::Tr("factory_test.step_title.nfc");
        case FactoryTestStep::kComplete:
            return I18n::Tr("factory_test.complete");
        case FactoryTestStep::kFailed:
            return I18n::Tr("factory_test.failed");
        default:
            return "";
    }
}

void FillLine(char* target, size_t size, const char* fmt, ...) {
    if (target == nullptr || size == 0) {
        return;
    }
    va_list args;
    va_start(args, fmt);
    vsnprintf(target, size, fmt, args);
    va_end(args);
    target[size - 1] = '\0';
}

void FillClock(char* target, size_t size, const tm& local_tm) {
    FillLine(target, size, "%02d:%02d:%02d",
             local_tm.tm_hour, local_tm.tm_min, local_tm.tm_sec);
}

int SecondsOfDay(const tm& local_tm) {
    return local_tm.tm_hour * 3600 + local_tm.tm_min * 60 + local_tm.tm_sec;
}

void ResetSnapshot(FactoryTestSnapshot* snapshot) {
    if (snapshot == nullptr) {
        return;
    }
    *snapshot = FactoryTestSnapshot{};
    snapshot->active = true;
    FillLine(snapshot->title, sizeof(snapshot->title), "%s", StepTitle(FactoryTestStep::kRf));
    FillLine(snapshot->hint, sizeof(snapshot->hint), "%s", I18n::Tr("factory_test.hint.ready"));
}

uint32_t ButtonToBit(FactoryTestButton button) {
    switch (button) {
        case FactoryTestButton::kConfirmClick:
            return kButtonConfirmClick;
        case FactoryTestButton::kConfirmLongPress:
            return kButtonConfirmLong;
        case FactoryTestButton::kUpClick:
            return kButtonUpClick;
        case FactoryTestButton::kDownClick:
            return kButtonDownClick;
        default:
            return 0;
    }
}

bool WaitForButtons(uint32_t wanted_bits, TickType_t timeout_ticks, uint32_t* out_bits) {
    if (out_bits != nullptr) {
        *out_bits = 0;
    }
    if (g_factory_test_task == nullptr) {
        vTaskDelay(timeout_ticks);
        return false;
    }
    uint32_t bits = 0;
    if (xTaskNotifyWait(0, UINT32_MAX, &bits, timeout_ticks) != pdTRUE) {
        return false;
    }
    if (out_bits != nullptr) {
        *out_bits = bits;
    }
    return (bits & wanted_bits) != 0;
}

bool EnsureWifiReadyForScan() {
    WifiManagerConfig config;
    config.ssid_prefix = "ZecTrix";
    config.language = I18n::GetLanguage();
    if (!WifiManager::GetInstance().Initialize(config)) {
        ESP_LOGE(TAG, "factory_test type=rf state=init result=FAIL reason=wifi_init");
        return false;
    }

    esp_err_t ret = esp_wifi_set_mode(WIFI_MODE_STA);
    if (ret != ESP_OK && ret != ESP_ERR_WIFI_NOT_INIT) {
        ESP_LOGW(TAG, "factory_test type=rf state=set_mode ret=%s", esp_err_to_name(ret));
    }
    ret = esp_wifi_set_storage(WIFI_STORAGE_RAM);
    if (ret != ESP_OK) {
        ESP_LOGW(TAG, "factory_test type=rf state=set_storage ret=%s", esp_err_to_name(ret));
    }
    ret = esp_wifi_start();
    if (ret != ESP_OK) {
        ESP_LOGW(TAG, "factory_test type=rf state=start ret=%s", esp_err_to_name(ret));
    }
    return true;
}

int ScanTargetWifiRssi() {
    wifi_scan_config_t scan_cfg = {};
    scan_cfg.show_hidden = true;
    scan_cfg.scan_type = WIFI_SCAN_TYPE_ACTIVE;
    esp_err_t ret = esp_wifi_scan_start(&scan_cfg, true);
    if (ret != ESP_OK) {
        ESP_LOGW(TAG, "factory_test type=rf state=scan_start ret=%s", esp_err_to_name(ret));
        return -127;
    }

    uint16_t ap_count = 0;
    ret = esp_wifi_scan_get_ap_num(&ap_count);
    if (ret != ESP_OK || ap_count == 0) {
        return -127;
    }

    std::vector<wifi_ap_record_t> ap_records(ap_count);
    ret = esp_wifi_scan_get_ap_records(&ap_count, ap_records.data());
    if (ret != ESP_OK) {
        ESP_LOGW(TAG, "factory_test type=rf state=scan_read ret=%s", esp_err_to_name(ret));
        return -127;
    }

    int best_rssi = -127;
    for (const auto& ap : ap_records) {
        if (strcmp(reinterpret_cast<const char*>(ap.ssid), kRfTargetSsid) == 0) {
            best_rssi = std::max(best_rssi, static_cast<int>(ap.rssi));
        }
    }
    return best_rssi;
}

AcousticSelftestSummary RunAudioPathTestOnce() {
    AcousticSelftestSummary summary;
    auto& app = Application::GetInstance();
    auto& audio_service = app.GetAudioService();
    const bool wake_word_running = audio_service.IsWakeWordRunning();
    const bool voice_processing_running = audio_service.IsAudioProcessorRunning();

    app.StopSound();
    audio_service.EnableWakeWordDetection(false);
    audio_service.EnableVoiceProcessing(false);

    AudioCodec* codec = Board::GetInstance().GetAudioCodec();
    if (codec == nullptr) {
        summary.pass = false;
        summary.reason = AcousticSelftestFailureReason::kUnsupportedCodec;
    } else {
        const bool input_enabled = codec->input_enabled();
        const bool output_enabled = codec->output_enabled();
        const int original_volume = codec->output_volume();
        if (original_volume != kFactoryTestVolume) {
            codec->SetOutputVolume(kFactoryTestVolume);
        }

        std::array<uint8_t, 6> mac = {0};
        esp_read_mac(mac.data(), ESP_MAC_WIFI_STA);
        summary = AcousticSelftest().Run(codec, mac);

        if (codec->output_volume() != original_volume) {
            codec->SetOutputVolume(original_volume);
        }
        if (!voice_processing_running && !wake_word_running && input_enabled != codec->input_enabled()) {
            codec->EnableInput(input_enabled);
        }
        if (output_enabled != codec->output_enabled()) {
            codec->EnableOutput(output_enabled);
        }
    }

    if (voice_processing_running) {
        audio_service.EnableVoiceProcessing(true);
    }
    if (wake_word_running) {
        audio_service.EnableWakeWordDetection(true);
    }

    return summary;
}

bool ReadBatteryPercent(int* level) {
    if (level == nullptr) {
        return false;
    }
    *level = 0;
    return ZectrixReadBatteryPercentForFactoryTest(level);
}

std::vector<uint8_t> BuildUriNdefMessage(const std::string& uri) {
    uint8_t prefix_code = 0x00;
    std::string uri_suffix = uri;
    if (uri.rfind("https://www.", 0) == 0) {
        prefix_code = 0x02;
        uri_suffix = uri.substr(strlen("https://www."));
    } else if (uri.rfind("http://www.", 0) == 0) {
        prefix_code = 0x01;
        uri_suffix = uri.substr(strlen("http://www."));
    } else if (uri.rfind("https://", 0) == 0) {
        prefix_code = 0x04;
        uri_suffix = uri.substr(strlen("https://"));
    } else if (uri.rfind("http://", 0) == 0) {
        prefix_code = 0x03;
        uri_suffix = uri.substr(strlen("http://"));
    }

    std::vector<uint8_t> payload;
    payload.reserve(1 + uri_suffix.size());
    payload.push_back(prefix_code);
    payload.insert(payload.end(), uri_suffix.begin(), uri_suffix.end());

    std::vector<uint8_t> message;
    if (payload.size() <= 0xFF) {
        message.reserve(4 + payload.size());
        message.push_back(0xD1);
        message.push_back(0x01);
        message.push_back(static_cast<uint8_t>(payload.size()));
    } else {
        const uint32_t payload_len = static_cast<uint32_t>(payload.size());
        message.reserve(7 + payload.size());
        message.push_back(0xC1);
        message.push_back(0x01);
        message.push_back(static_cast<uint8_t>((payload_len >> 24) & 0xFF));
        message.push_back(static_cast<uint8_t>((payload_len >> 16) & 0xFF));
        message.push_back(static_cast<uint8_t>((payload_len >> 8) & 0xFF));
        message.push_back(static_cast<uint8_t>(payload_len & 0xFF));
    }
    message.push_back('U');
    message.insert(message.end(), payload.begin(), payload.end());
    return message;
}

std::vector<uint8_t> BuildStoredNdefData(const std::vector<uint8_t>& message) {
    std::vector<uint8_t> storage;
    if (message.size() <= 0xFE) {
        storage.reserve(2 + message.size() + 1);
        storage.push_back(0x03);
        storage.push_back(static_cast<uint8_t>(message.size()));
    } else {
        storage.reserve(4 + message.size() + 1);
        storage.push_back(0x03);
        storage.push_back(0xFF);
        storage.push_back(static_cast<uint8_t>((message.size() >> 8) & 0xFF));
        storage.push_back(static_cast<uint8_t>(message.size() & 0xFF));
    }
    storage.insert(storage.end(), message.begin(), message.end());
    storage.push_back(0xFE);
    return storage;
}

std::string HexPreview(const std::vector<uint8_t>& data, size_t max_bytes = 8) {
    static constexpr char kHex[] = "0123456789ABCDEF";

    if (data.empty()) {
        return "empty";
    }

    const size_t preview_len = std::min(data.size(), max_bytes);
    std::string out;
    out.reserve(preview_len * 3 + 8);
    for (size_t i = 0; i < preview_len; ++i) {
        if (i > 0) {
            out.push_back(':');
        }
        const uint8_t value = data[i];
        out.push_back(kHex[(value >> 4) & 0x0F]);
        out.push_back(kHex[value & 0x0F]);
    }
    if (data.size() > preview_len) {
        out += "...";
    }
    return out;
}

}  // namespace

FactoryTestService& FactoryTestService::Instance() {
    static FactoryTestService instance;
    return instance;
}

bool FactoryTestService::IsRunning() const {
    return running_.load(std::memory_order_acquire);
}

FactoryTestSnapshot FactoryTestService::GetSnapshot() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return snapshot_;
}

void FactoryTestService::SetSnapshotCallback(SnapshotCallback callback) {
    SnapshotCallback current_callback;
    FactoryTestSnapshot snapshot;
    {
        std::lock_guard<std::mutex> lock(mutex_);
        snapshot_callback_ = std::move(callback);
        current_callback = snapshot_callback_;
        snapshot = snapshot_;
    }
    if (current_callback) {
        current_callback(snapshot);
    }
}

void FactoryTestService::SetShutdownCallback(VoidCallback callback) {
    std::lock_guard<std::mutex> lock(mutex_);
    shutdown_callback_ = std::move(callback);
}

void FactoryTestService::PublishSnapshotLocked() const {
    SnapshotCallback callback;
    FactoryTestSnapshot snapshot;
    {
        std::lock_guard<std::mutex> lock(mutex_);
        callback = snapshot_callback_;
        snapshot = snapshot_;
    }
    if (callback) {
        callback(snapshot);
    }
}

void FactoryTestService::StartFlow() {
    bool expected = false;
    if (!running_.compare_exchange_strong(expected, true, std::memory_order_acq_rel)) {
        PublishSnapshotLocked();
        return;
    }

    {
        std::lock_guard<std::mutex> lock(mutex_);
        ResetSnapshot(&snapshot_);
    }
    PublishSnapshotLocked();

    if (xTaskCreate(FlowTaskEntry, "ft_flow", 8192, this, 3, &g_factory_test_task) != pdPASS) {
        running_.store(false, std::memory_order_release);
        g_factory_test_task = nullptr;
        {
            std::lock_guard<std::mutex> lock(mutex_);
            snapshot_.current_state = FactoryTestStepState::kFail;
            snapshot_.terminal_failure = true;
            FillLine(snapshot_.hint, sizeof(snapshot_.hint), "%s", I18n::Tr("factory_test.error.task_start_failed"));
            FillLine(snapshot_.footer, sizeof(snapshot_.footer), "%s", I18n::Tr("factory_test.footer.long_confirm_shutdown"));
        }
        PublishSnapshotLocked();
    }
}

void FactoryTestService::HandleButton(FactoryTestButton button) {
    const uint32_t bit = ButtonToBit(button);
    if (bit == 0 || g_factory_test_task == nullptr) {
        return;
    }
    xTaskNotify(g_factory_test_task, bit, eSetBits);
}

void FactoryTestService::FlowTaskEntry(void* arg) {
    auto* self = static_cast<FactoryTestService*>(arg);
    self->FlowTask();
    g_factory_test_task = nullptr;
    self->running_.store(false, std::memory_order_release);
    vTaskDelete(nullptr);
}

void FactoryTestService::FlowTask() {
    auto set_step_state = [this](FactoryTestStep step,
                                 FactoryTestStepState state,
                                 const char* hint = nullptr) {
        const int index = StepIndex(step);
        {
            std::lock_guard<std::mutex> lock(mutex_);
            snapshot_.current_step = step;
            snapshot_.current_state = state;
            if (index >= 0 && index < static_cast<int>(snapshot_.step_states.size())) {
                snapshot_.step_states[static_cast<size_t>(index)] = state;
            }
            FillLine(snapshot_.title, sizeof(snapshot_.title), "%s", StepTitle(step));
            if (hint != nullptr) {
                FillLine(snapshot_.hint, sizeof(snapshot_.hint), "%s", hint);
            }
            snapshot_.detail1[0] = '\0';
            snapshot_.detail2[0] = '\0';
            snapshot_.detail3[0] = '\0';
            snapshot_.detail4[0] = '\0';
            snapshot_.footer[0] = '\0';
        }
        PublishSnapshotLocked();
    };

    auto mark_failure_and_wait_poweroff = [this, &set_step_state](FactoryTestStep step, const char* reason) {
        set_step_state(step, FactoryTestStepState::kFail, reason);
        {
            std::lock_guard<std::mutex> lock(mutex_);
            snapshot_.terminal_failure = true;
            FillLine(snapshot_.footer, sizeof(snapshot_.footer), "%s", I18n::Tr("factory_test.footer.long_confirm_shutdown"));
        }
        PublishSnapshotLocked();

        while (true) {
            uint32_t bits = 0;
            if (WaitForButtons(kButtonConfirmLong, kOperatorWaitTicks, &bits) &&
                (bits & kButtonConfirmLong) != 0) {
                VoidCallback shutdown_cb;
                {
                    std::lock_guard<std::mutex> lock(mutex_);
                    shutdown_cb = shutdown_callback_;
                }
                if (shutdown_cb) {
                    shutdown_cb();
                }
                break;
            }
        }
    };

    set_step_state(FactoryTestStep::kRf, FactoryTestStepState::kRunning, I18n::Tr("factory_test.rf.scanning"));
    if (!EnsureWifiReadyForScan()) {
        mark_failure_and_wait_poweroff(FactoryTestStep::kRf, I18n::Tr("factory_test.rf.wifi_init_failed"));
        return;
    }

    int consecutive_hits = 0;
    while (consecutive_hits < kRfPassCount) {
        const int rssi = ScanTargetWifiRssi();
        const bool hit = rssi >= kRfThresholdDbm;
        consecutive_hits = hit ? (consecutive_hits + 1) : 0;
        {
            std::lock_guard<std::mutex> lock(mutex_);
            FillLine(snapshot_.detail1, sizeof(snapshot_.detail1), I18n::Tr("factory_test.rf.ssid_fmt"), kRfTargetSsid);
            if (rssi <= -127) {
                FillLine(snapshot_.detail2, sizeof(snapshot_.detail2), "%s", I18n::Tr("factory_test.rf.rssi_not_found"));
            } else {
                FillLine(snapshot_.detail2, sizeof(snapshot_.detail2), I18n::Tr("factory_test.rf.rssi_fmt"), rssi);
            }
            FillLine(snapshot_.detail3, sizeof(snapshot_.detail3), I18n::Tr("factory_test.rf.consecutive_hits_fmt"), consecutive_hits, kRfPassCount);
            FillLine(snapshot_.detail4, sizeof(snapshot_.detail4), I18n::Tr("factory_test.rf.threshold_fmt"), kRfThresholdDbm);
        }
        PublishSnapshotLocked();
        if (consecutive_hits >= kRfPassCount) {
            break;
        }
        vTaskDelay(kRfRetryDelayTicks);
    }
    set_step_state(FactoryTestStep::kRf, FactoryTestStepState::kPass, I18n::Tr("factory_test.rf.pass"));
    esp_wifi_stop();

    set_step_state(FactoryTestStep::kAudio, FactoryTestStepState::kRunning, I18n::Tr("factory_test.audio.running"));
    while (true) {
        const AcousticSelftestSummary summary = RunAudioPathTestOnce();
        {
            std::lock_guard<std::mutex> lock(mutex_);
            FillLine(snapshot_.detail1, sizeof(snapshot_.detail1), I18n::Tr("factory_test.audio.status_fmt"),
                     summary.pass ? I18n::Tr("factory_test.state.pass") : I18n::Tr("factory_test.state.fail"));
            FillLine(snapshot_.detail2, sizeof(snapshot_.detail2), "round=%d fc=%d", summary.round, summary.fc);
            FillLine(snapshot_.detail3, sizeof(snapshot_.detail3), "reason=%s",
                     AcousticSelftest::FailureReasonToString(summary.reason));
            snapshot_.detail4[0] = '\0';
        }
        PublishSnapshotLocked();
        if (summary.pass) {
            break;
        }
        vTaskDelay(kAudioRetryDelayTicks);
    }
    set_step_state(FactoryTestStep::kAudio, FactoryTestStepState::kPass, I18n::Tr("factory_test.audio.pass"));

    set_step_state(FactoryTestStep::kRtc, FactoryTestStepState::kRunning, I18n::Tr("factory_test.rtc.running"));
    bool rtc_passed = false;
    while (true) {
        auto* rtc = ZectrixGetRtc();
        if (rtc == nullptr) {
            {
                std::lock_guard<std::mutex> lock(mutex_);
                FillLine(snapshot_.detail1, sizeof(snapshot_.detail1), "RTC=NOT_FOUND");
                FillLine(snapshot_.detail2, sizeof(snapshot_.detail2), "NOW=--:--:--");
                FillLine(snapshot_.detail3, sizeof(snapshot_.detail3), "INT=WAIT TF=0");
                FillLine(snapshot_.detail4, sizeof(snapshot_.detail4), "%s", I18n::Tr("factory_test.rtc.retrying"));
            }
            PublishSnapshotLocked();
            vTaskDelay(kRtcRetryDelayTicks);
            continue;
        }

        tm start_tm = {};
        start_tm.tm_year = 124;
        start_tm.tm_mon = 0;
        start_tm.tm_mday = 1;
        start_tm.tm_wday = 1;
        start_tm.tm_hour = kRtcStartHour;
        start_tm.tm_min = kRtcStartMinute;
        start_tm.tm_sec = kRtcStartSecond;

        rtc->ConsumeInterrupt();
        rtc->StopCountdownTimer();
        rtc->DisableAlarm();
        rtc->ClearAlarmFlag();
        rtc->ClearTimerFlag();

        bool ok = rtc->SetTime(start_tm) && rtc->StartCountdownTimer(kRtcTestDurationSeconds);
        if (ok) {
            const int64_t deadline_us = esp_timer_get_time() + kRtcTimeoutUs;
            bool fired = false;
            bool gpio_hit = false;
            bool flag_hit = false;
            bool time_reached = false;
            bool read_ok = true;
            tm current_tm = start_tm;
            const int start_seconds = SecondsOfDay(start_tm);
            while (esp_timer_get_time() < deadline_us) {
                read_ok = rtc->GetTime(current_tm);
                const bool pending = rtc->ConsumeInterrupt();
                gpio_hit = gpio_get_level(RTC_INT_GPIO) == 0;
                flag_hit = rtc->IsTimerFired();
                fired = fired || pending || gpio_hit || flag_hit;
                if (read_ok) {
                    const int elapsed_seconds = SecondsOfDay(current_tm) - start_seconds;
                    time_reached = elapsed_seconds >= kRtcTestDurationSeconds;
                    {
                        std::lock_guard<std::mutex> lock(mutex_);
                        char now_line[96];
                        FillClock(now_line, sizeof(now_line), current_tm);
                        FillLine(snapshot_.detail1, sizeof(snapshot_.detail1),
                                 "SET=%02d:%02d:%02d",
                                 kRtcStartHour, kRtcStartMinute, kRtcStartSecond);
                        FillLine(snapshot_.detail2, sizeof(snapshot_.detail2), "NOW=%s", now_line);
                        FillLine(snapshot_.detail3, sizeof(snapshot_.detail3), "INT=%s TF=%d",
                                 gpio_hit || pending ? "HIT" : "WAIT", flag_hit ? 1 : 0);
                        FillLine(snapshot_.detail4, sizeof(snapshot_.detail4), "elapsed=%d/%ds",
                                 elapsed_seconds < 0 ? 0 : elapsed_seconds, kRtcTestDurationSeconds);
                    }
                } else {
                    {
                        std::lock_guard<std::mutex> lock(mutex_);
                        FillLine(snapshot_.detail1, sizeof(snapshot_.detail1),
                                 "SET=%02d:%02d:%02d",
                                 kRtcStartHour, kRtcStartMinute, kRtcStartSecond);
                        FillLine(snapshot_.detail2, sizeof(snapshot_.detail2), "NOW=READ_FAIL");
                        FillLine(snapshot_.detail3, sizeof(snapshot_.detail3), "INT=%s TF=%d",
                                 gpio_hit || pending ? "HIT" : "WAIT", flag_hit ? 1 : 0);
                        FillLine(snapshot_.detail4, sizeof(snapshot_.detail4), "elapsed=READ_FAIL");
                    }
                }
                PublishSnapshotLocked();

                if (!read_ok) {
                    break;
                }
                if (fired && time_reached) {
                    rtc->ClearTimerFlag();
                    rtc->StopCountdownTimer();
                    break;
                }

                vTaskDelay(kRtcPollTicks);
            }

            rtc->StopCountdownTimer();
            rtc->ClearTimerFlag();

            if (!read_ok) {
                {
                    std::lock_guard<std::mutex> lock(mutex_);
                    FillLine(snapshot_.hint, sizeof(snapshot_.hint), "%s", I18n::Tr("factory_test.rtc.readback_failed"));
                }
                PublishSnapshotLocked();
                mark_failure_and_wait_poweroff(FactoryTestStep::kRtc, I18n::Tr("factory_test.rtc.readback_failed"));
                return;
            }

            if (fired && time_reached) {
                {
                    std::lock_guard<std::mutex> lock(mutex_);
                    snapshot_.current_state = FactoryTestStepState::kPass;
                    snapshot_.step_states[static_cast<size_t>(StepIndex(FactoryTestStep::kRtc))] =
                        FactoryTestStepState::kPass;
                    FillLine(snapshot_.hint, sizeof(snapshot_.hint), "%s", I18n::Tr("factory_test.rtc.pass"));
                    FillLine(snapshot_.detail3, sizeof(snapshot_.detail3), "INT=%s TF=%d",
                             fired ? "HIT" : "WAIT", flag_hit ? 1 : 0);
                    FillLine(snapshot_.detail4, sizeof(snapshot_.detail4), "elapsed=%d/%ds",
                             kRtcTestDurationSeconds, kRtcTestDurationSeconds);
                }
                PublishSnapshotLocked();
                rtc_passed = true;
                break;
            }

            if (!time_reached) {
                {
                    std::lock_guard<std::mutex> lock(mutex_);
                    FillLine(snapshot_.hint, sizeof(snapshot_.hint), "%s", I18n::Tr("factory_test.rtc.time_not_reached"));
                }
                PublishSnapshotLocked();
                mark_failure_and_wait_poweroff(FactoryTestStep::kRtc, I18n::Tr("factory_test.rtc.time_not_increasing"));
                return;
            }

            {
                std::lock_guard<std::mutex> lock(mutex_);
                FillLine(snapshot_.hint, sizeof(snapshot_.hint), "%s", I18n::Tr("factory_test.rtc.timeout"));
            }
            PublishSnapshotLocked();
            mark_failure_and_wait_poweroff(FactoryTestStep::kRtc, I18n::Tr("factory_test.rtc.trigger_failed"));
            return;
        }
        {
            std::lock_guard<std::mutex> lock(mutex_);
            FillLine(snapshot_.detail1, sizeof(snapshot_.detail1), "SET=08:00:00");
            FillLine(snapshot_.detail2, sizeof(snapshot_.detail2), "NOW=--:--:--");
            FillLine(snapshot_.detail3, sizeof(snapshot_.detail3), "INT=WAIT TF=0");
            FillLine(snapshot_.detail4, sizeof(snapshot_.detail4), I18n::Tr("factory_test.rtc.elapsed_retry_fmt"), kRtcTestDurationSeconds);
        }
        PublishSnapshotLocked();
        vTaskDelay(kRtcRetryDelayTicks);
    }
    if (!rtc_passed) {
        mark_failure_and_wait_poweroff(FactoryTestStep::kRtc, I18n::Tr("factory_test.rtc.not_completed"));
        return;
    }

    set_step_state(FactoryTestStep::kCharge, FactoryTestStepState::kRunning, I18n::Tr("factory_test.charge.insert_usb"));
    while (true) {
        int battery = 0;
        const bool has_battery = ReadBatteryPercent(&battery);
        const ChargeStatus::Snapshot charge = ZectrixRefreshChargeSnapshotForFactoryTest();
        const bool usb_in = charge.power_present;
        const bool pass = charge.charging || (charge.full && has_battery && battery > 97);
        {
            std::lock_guard<std::mutex> lock(mutex_);
            FillLine(snapshot_.detail1, sizeof(snapshot_.detail1), "USB=%s", usb_in ? "IN" : "OUT");
            FillLine(snapshot_.detail2, sizeof(snapshot_.detail2), "CHG=%d FULL=%d",
                     charge.charging ? 1 : 0, charge.full ? 1 : 0);
            FillLine(snapshot_.detail3, sizeof(snapshot_.detail3), "BAT=%s",
                     has_battery ? (std::to_string(battery) + "%").c_str() : "--");
            if (charge.no_battery) {
                FillLine(snapshot_.detail4, sizeof(snapshot_.detail4), "%s", I18n::Tr("factory_test.charge.no_battery"));
            } else if (charge.full && has_battery && battery <= 97) {
                FillLine(snapshot_.detail4, sizeof(snapshot_.detail4), "%s", I18n::Tr("factory_test.charge.full_signal_but_low"));
            } else {
                snapshot_.detail4[0] = '\0';
            }
        }
        PublishSnapshotLocked();
        if (pass && !charge.no_battery) {
            break;
        }
        vTaskDelay(kChargePollTicks);
    }
    set_step_state(FactoryTestStep::kCharge, FactoryTestStepState::kPass, I18n::Tr("factory_test.charge.pass"));

    set_step_state(FactoryTestStep::kLed, FactoryTestStepState::kRunning, I18n::Tr("factory_test.led.blink_hint"));
    {
        std::lock_guard<std::mutex> lock(mutex_);
        FillLine(snapshot_.detail1, sizeof(snapshot_.detail1), "%s", I18n::Tr("factory_test.led.gpio3_blinking"));
        FillLine(snapshot_.detail2, sizeof(snapshot_.detail2), "%s", I18n::Tr("factory_test.led.example_fail_hint"));
        snapshot_.detail3[0] = '\0';
        snapshot_.detail4[0] = '\0';
    }
    PublishSnapshotLocked();
    ZectrixSetFactoryLedOverride(true, true);
    while (true) {
        uint32_t bits = 0;
        if (!WaitForButtons(kButtonConfirmClick | kButtonDownClick, kOperatorWaitTicks, &bits)) {
            continue;
        }
        if ((bits & kButtonConfirmClick) != 0) {
            break;
        }
        if ((bits & kButtonDownClick) != 0) {
            ZectrixSetFactoryLedOverride(false, false);
            mark_failure_and_wait_poweroff(FactoryTestStep::kLed, I18n::Tr("factory_test.led.failed"));
            return;
        }
    }
    ZectrixSetFactoryLedOverride(false, false);
    set_step_state(FactoryTestStep::kLed, FactoryTestStepState::kPass, I18n::Tr("factory_test.led.pass"));

    auto update_key_stage_locked = [this](int key_stage, int failed_stage) {
        FillLine(snapshot_.detail1, sizeof(snapshot_.detail1), I18n::Tr("factory_test.keys.confirm_stage_fmt"),
                 failed_stage == 0 ? 'X' : (key_stage > 0 ? 'x' : (key_stage == 0 ? '>' : ' ')));
        FillLine(snapshot_.detail2, sizeof(snapshot_.detail2), I18n::Tr("factory_test.keys.up_stage_fmt"),
                 failed_stage == 1 ? 'X' : (key_stage > 1 ? 'x' : (key_stage == 1 ? '>' : ' ')));
        FillLine(snapshot_.detail3, sizeof(snapshot_.detail3), I18n::Tr("factory_test.keys.down_stage_fmt"),
                 failed_stage == 2 ? 'X' : (key_stage > 2 ? 'x' : (key_stage == 2 ? '>' : ' ')));
    };

    set_step_state(FactoryTestStep::kKeys, FactoryTestStepState::kRunning, I18n::Tr("factory_test.keys.press_order"));
    while (true) {
        int key_stage = 0;
        bool restart_key_test = false;
        while (key_stage < 3) {
            {
                std::lock_guard<std::mutex> lock(mutex_);
                update_key_stage_locked(key_stage, -1);
                snapshot_.detail4[0] = '\0';
            }
            PublishSnapshotLocked();

            uint32_t bits = 0;
            if (!WaitForButtons(kButtonConfirmClick | kButtonUpClick | kButtonDownClick,
                                portMAX_DELAY, &bits)) {
                continue;
            }
            if (key_stage == 0 && (bits & kButtonConfirmClick) != 0) {
                ++key_stage;
                continue;
            }
            if (key_stage == 1 && (bits & kButtonUpClick) != 0) {
                ++key_stage;
                continue;
            }
            if (key_stage == 2 && (bits & kButtonDownClick) != 0) {
                ++key_stage;
                continue;
            }

            {
                std::lock_guard<std::mutex> lock(mutex_);
                snapshot_.current_step = FactoryTestStep::kKeys;
                snapshot_.current_state = FactoryTestStepState::kFail;
                snapshot_.step_states[static_cast<size_t>(StepIndex(FactoryTestStep::kKeys))] =
                    FactoryTestStepState::kFail;
                FillLine(snapshot_.title, sizeof(snapshot_.title), "%s", StepTitle(FactoryTestStep::kKeys));
                FillLine(snapshot_.hint, sizeof(snapshot_.hint), "%s", I18n::Tr("factory_test.keys.wrong_order_restart"));
                FillLine(snapshot_.footer, sizeof(snapshot_.footer), "%s", I18n::Tr("factory_test.keys.restart_footer"));
                update_key_stage_locked(key_stage, key_stage);
                FillLine(snapshot_.detail4, sizeof(snapshot_.detail4), "%s", I18n::Tr("factory_test.keys.auto_restart_hint"));
            }
            PublishSnapshotLocked();
            vTaskDelay(kKeyRetryDelayTicks);

            set_step_state(FactoryTestStep::kKeys, FactoryTestStepState::kRunning,
                           I18n::Tr("factory_test.keys.press_order"));
            restart_key_test = true;
            break;
        }
        if (restart_key_test) {
            continue;
        }
        break;
    }
    set_step_state(FactoryTestStep::kKeys, FactoryTestStepState::kPass, I18n::Tr("factory_test.keys.pass"));

    set_step_state(FactoryTestStep::kNfc, FactoryTestStepState::kRunning, I18n::Tr("factory_test.nfc.writing_link"));
    const std::string nfc_url = "https://www.zectrix.com";
    const std::vector<uint8_t> expected_ndef = BuildUriNdefMessage(nfc_url);
    const std::vector<uint8_t> expected_storage = BuildStoredNdefData(expected_ndef);
    ESP_LOGI(TAG,
             "factory_test type=nfc state=enter url=%s expected_storage_len=%u expected_ndef_len=%u expected_storage=%s expected_ndef=%s",
             nfc_url.c_str(),
             static_cast<unsigned>(expected_storage.size()),
             static_cast<unsigned>(expected_ndef.size()),
             HexPreview(expected_storage).c_str(),
             HexPreview(expected_ndef).c_str());
    ZectrixNfc* nfc = ZectrixGetNfc();
    if (nfc == nullptr) {
        ESP_LOGE(TAG, "factory_test type=nfc state=enter result=FAIL reason=device_null");
        mark_failure_and_wait_poweroff(FactoryTestStep::kNfc, I18n::Tr("factory_test.nfc.not_initialized"));
        return;
    }

    bool nfc_write_verified = false;
    esp_err_t last_write_ret = ESP_FAIL;
    esp_err_t last_read_ret = ESP_FAIL;
    esp_err_t last_decode_ret = ESP_FAIL;
    std::vector<uint8_t> actual_ndef;
    std::vector<uint8_t> actual_storage;
    for (int attempt = 1; attempt <= 3; ++attempt) {
        if (!nfc->IsPowered() && !nfc->PowerOn()) {
            last_write_ret = ESP_ERR_INVALID_STATE;
            last_read_ret = ESP_ERR_INVALID_STATE;
            last_decode_ret = ESP_ERR_INVALID_STATE;
            actual_storage.clear();
            actual_ndef.clear();
        } else {
            last_write_ret = nfc->WriteUriNdef(nfc_url);
            actual_storage.assign(expected_storage.size(), 0);
            actual_ndef.clear();
            last_read_ret = (last_write_ret == ESP_OK)
                                ? nfc->ReadUserData(0, actual_storage.data(), actual_storage.size())
                                : last_write_ret;
            last_decode_ret =
                (last_read_ret == ESP_OK) ? nfc->ReadNdef(&actual_ndef) : last_read_ret;
            nfc_write_verified =
                last_write_ret == ESP_OK &&
                last_read_ret == ESP_OK &&
                last_decode_ret == ESP_OK &&
                actual_storage == expected_storage &&
                actual_ndef == expected_ndef;
        }

        ESP_LOGI(TAG,
                 "factory_test type=nfc state=write attempt=%d write=%s raw=%s ndef=%s raw_match=%d ndef_match=%d raw_data=%s ndef_data=%s",
                 attempt,
                 esp_err_to_name(last_write_ret),
                 esp_err_to_name(last_read_ret),
                 esp_err_to_name(last_decode_ret),
                 actual_storage == expected_storage ? 1 : 0,
                 actual_ndef == expected_ndef ? 1 : 0,
                 HexPreview(actual_storage).c_str(),
                 HexPreview(actual_ndef).c_str());

        {
            std::lock_guard<std::mutex> lock(mutex_);
            FillLine(snapshot_.detail1, sizeof(snapshot_.detail1), "URL=%s", nfc_url.c_str());
            FillLine(snapshot_.detail2, sizeof(snapshot_.detail2), "WRITE=%s RAW=%s NDEF=%s",
                     esp_err_to_name(last_write_ret),
                     esp_err_to_name(last_read_ret),
                     esp_err_to_name(last_decode_ret));
            FillLine(snapshot_.detail3, sizeof(snapshot_.detail3), I18n::Tr("factory_test.nfc.verify_attempt_fmt"),
                     nfc_write_verified ? I18n::Tr("factory_test.state.pass") : I18n::Tr("factory_test.state.fail"),
                     attempt);
            FillLine(snapshot_.detail4, sizeof(snapshot_.detail4), "RAW=%uB NDEF=%uB",
                     static_cast<unsigned>(actual_storage.size()),
                     static_cast<unsigned>(actual_ndef.size()));
        }
        PublishSnapshotLocked();

        if (nfc_write_verified) {
            break;
        }
        vTaskDelay(kNfcRetryDelayTicks);
    }

    if (!nfc_write_verified) {
        ESP_LOGE(TAG, "factory_test type=nfc state=write result=FAIL");
        mark_failure_and_wait_poweroff(FactoryTestStep::kNfc, I18n::Tr("factory_test.nfc.write_or_verify_failed"));
        return;
    }

    ESP_LOGI(TAG, "factory_test type=nfc state=write result=PASS");

    int idle_stable_count = 0;
    bool last_idle_field_state = true;
    while (idle_stable_count < 3) {
        const bool field_present = nfc->HasField();
        const int fd_level = gpio_get_level(NFC_FD_GPIO);
        if (field_present != last_idle_field_state || idle_stable_count == 0) {
            ESP_LOGI(TAG, "factory_test type=nfc state=wait_idle fd=%d field=%d stable=%d/3",
                     fd_level, field_present ? 1 : 0, idle_stable_count);
            last_idle_field_state = field_present;
        }
        {
            std::lock_guard<std::mutex> lock(mutex_);
            FillLine(snapshot_.detail1, sizeof(snapshot_.detail1), "URL=%s", nfc_url.c_str());
            FillLine(snapshot_.detail2, sizeof(snapshot_.detail2), "%s", I18n::Tr("factory_test.nfc.write_verify_pass"));
            FillLine(snapshot_.detail3, sizeof(snapshot_.detail3), I18n::Tr("factory_test.nfc.fd_field_idle_fmt"),
                     fd_level, field_present ? "FIELD" : "IDLE", idle_stable_count);
            FillLine(snapshot_.detail4, sizeof(snapshot_.detail4), "%s", I18n::Tr("factory_test.nfc.keep_away"));
        }
        PublishSnapshotLocked();
        idle_stable_count = field_present ? 0 : (idle_stable_count + 1);
        vTaskDelay(kNfcPollTicks);
    }

    int read_stable_count = 0;
    bool last_read_field_state = false;
    while (read_stable_count < 3) {
        const bool field_present = nfc->HasField();
        const int fd_level = gpio_get_level(NFC_FD_GPIO);
        read_stable_count = field_present ? (read_stable_count + 1) : 0;
        if (field_present != last_read_field_state || read_stable_count == 1) {
            ESP_LOGI(TAG, "factory_test type=nfc state=wait_read fd=%d field=%d stable=%d/3",
                     fd_level, field_present ? 1 : 0, read_stable_count);
            last_read_field_state = field_present;
        }
        {
            std::lock_guard<std::mutex> lock(mutex_);
            FillLine(snapshot_.detail1, sizeof(snapshot_.detail1), "URL=%s", nfc_url.c_str());
            FillLine(snapshot_.detail2, sizeof(snapshot_.detail2), "%s", I18n::Tr("factory_test.nfc.write_verify_pass"));
            FillLine(snapshot_.detail3, sizeof(snapshot_.detail3), I18n::Tr("factory_test.nfc.fd_field_read_fmt"),
                     fd_level, field_present ? "FIELD" : "IDLE", read_stable_count);
            FillLine(snapshot_.detail4, sizeof(snapshot_.detail4), "%s", I18n::Tr("factory_test.nfc.bring_close_and_read"));
        }
        PublishSnapshotLocked();
        vTaskDelay(kNfcPollTicks);
    }
    ESP_LOGI(TAG, "factory_test type=nfc state=wait_read result=PASS");
    set_step_state(FactoryTestStep::kNfc, FactoryTestStepState::kPass, I18n::Tr("factory_test.nfc.pass"));

    {
        std::lock_guard<std::mutex> lock(mutex_);
        snapshot_.current_step = FactoryTestStep::kComplete;
        snapshot_.current_state = FactoryTestStepState::kPass;
        snapshot_.terminal_failure = false;
        FillLine(snapshot_.title, sizeof(snapshot_.title), "%s", StepTitle(FactoryTestStep::kComplete));
        FillLine(snapshot_.hint, sizeof(snapshot_.hint), "%s", I18n::Tr("factory_test.complete.pre_shutdown"));
        FillLine(snapshot_.detail1, sizeof(snapshot_.detail1), "%s", I18n::Tr("factory_test.complete.unplug_usb"));
        FillLine(snapshot_.detail2, sizeof(snapshot_.detail2), "USB=IN");
        FillLine(snapshot_.detail3, sizeof(snapshot_.detail3), "%s", I18n::Tr("factory_test.complete.unplug_then_confirm_shutdown"));
        snapshot_.detail4[0] = '\0';
        FillLine(snapshot_.footer, sizeof(snapshot_.footer), "%s", I18n::Tr("factory_test.complete.footer"));
    }
    PublishSnapshotLocked();

    while (true) {
        const ChargeStatus::Snapshot charge = ZectrixRefreshChargeSnapshotForFactoryTest();
        const bool usb_removed = !charge.power_present;
        {
            std::lock_guard<std::mutex> lock(mutex_);
            FillLine(snapshot_.detail2, sizeof(snapshot_.detail2), "USB=%s",
                     usb_removed ? "OUT" : "IN");
            if (usb_removed) {
                FillLine(snapshot_.detail4, sizeof(snapshot_.detail4), "%s", I18n::Tr("factory_test.complete.confirm_click_shutdown"));
            } else {
                FillLine(snapshot_.detail4, sizeof(snapshot_.detail4), "%s", I18n::Tr("factory_test.complete.please_unplug_usb"));
            }
        }
        PublishSnapshotLocked();

        uint32_t bits = 0;
        if (WaitForButtons(kButtonConfirmClick, kOperatorWaitTicks, &bits) &&
            (bits & kButtonConfirmClick) != 0) {
            if (!usb_removed) {
                {
                    std::lock_guard<std::mutex> lock(mutex_);
                    FillLine(snapshot_.hint, sizeof(snapshot_.hint), "%s", I18n::Tr("factory_test.complete.unplug_then_confirm"));
                    FillLine(snapshot_.footer, sizeof(snapshot_.footer), "%s", I18n::Tr("factory_test.complete.usb_not_unplugged_cannot_shutdown"));
                }
                PublishSnapshotLocked();
                continue;
            }
            VoidCallback shutdown_cb;
            {
                std::lock_guard<std::mutex> lock(mutex_);
                shutdown_cb = shutdown_callback_;
            }
            if (shutdown_cb) {
                shutdown_cb();
            }
            return;
        }
    }
}
