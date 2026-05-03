#include "application.h"

#include "board.h"
#include "display.h"

#include <esp_log.h>
#include <esp_timer.h>

#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"

namespace {

constexpr char kTag[] = "Application";

static int64_t NowMs() {
    return esp_timer_get_time() / 1000;
}

}  // namespace

Application::Application() = default;

Application::~Application() = default;

void Application::Initialize() {
    auto& board = Board::GetInstance();
    SetDeviceState(kDeviceStateStarting);

    AudioCodec* codec = board.GetAudioCodec();
    if (codec == nullptr) {
        ESP_LOGE(kTag, "Audio codec is null");
        SetDeviceState(kDeviceStateFatalError);
        return;
    }

    audio_service_.Initialize(codec);
    audio_service_.Start();

    if (event_queue_ == nullptr) {
        event_queue_ = xQueueCreate(16, sizeof(AppEvent));
        if (event_queue_ == nullptr) {
            ESP_LOGW(kTag, "event queue create failed");
        }
    }

    Display* display = board.GetDisplay();
    if (display != nullptr) {
        display->UpdateStatusBar(true);
    }

    SetDeviceState(kDeviceStateIdle);
    if (board.IsFactoryTestMode()) {
        board.EnterFactoryTestFlow();
    } else {
        board.EnterNormalFlow();
    }
}

void Application::Run() {
    while (true) {
        AppEvent e;
        bool got = false;
        if (event_queue_ != nullptr) {
            got = xQueueReceive(static_cast<QueueHandle_t>(event_queue_), &e, pdMS_TO_TICKS(1000)) == pdTRUE;
        } else {
            vTaskDelay(pdMS_TO_TICKS(1000));
        }
        if (got) {
            HandleEvent(e);
        } else {
            Tick();
        }
    }
}

bool Application::SetDeviceState(DeviceState state) {
    const DeviceState old_state = state_.exchange(state, std::memory_order_acq_rel);
    ESP_LOGI(kTag, "State %d -> %d", old_state, state);
    return true;
}

void Application::Schedule(std::function<void()>&& callback) {
    if (callback) {
        callback();
    }
}

void Application::PostEvent(AppEventType type, int32_t arg) {
    if (event_queue_ == nullptr) {
        return;
    }
    AppEvent e;
    e.type = type;
    e.arg = arg;
    (void)xQueueSend(static_cast<QueueHandle_t>(event_queue_), &e, 0);
}

void Application::NotifyNetworkConnected() {
    PostEvent(AppEventType::NetworkConnected);
}

void Application::NotifyNetworkDisconnected() {
    PostEvent(AppEventType::NetworkDisconnected);
}

void Application::RequestRecoveryMode() {
    PostEvent(AppEventType::EnterRecovery);
}

void Application::RequestNormalMode() {
    PostEvent(AppEventType::EnterNormal);
}

void Application::HandleEvent(const AppEvent& e) {
    switch (e.type) {
        case AppEventType::NetworkConnected: {
            last_connected_ms_ = NowMs();
            disconnect_burst_ = 0;
            in_recovery_ = false;
            break;
        }
        case AppEventType::NetworkDisconnected: {
            const int64_t now = NowMs();
            if (last_disconnect_ms_ > 0 && (now - last_disconnect_ms_) > 5 * 60 * 1000) {
                disconnect_burst_ = 0;
            }
            last_disconnect_ms_ = now;
            disconnect_burst_++;
            if (!in_recovery_ && disconnect_burst_ >= 3) {
                auto& board = Board::GetInstance();
                board.EnterRecoveryFlow();
                in_recovery_ = true;
            }
            break;
        }
        case AppEventType::EnterRecovery: {
            auto& board = Board::GetInstance();
            board.EnterRecoveryFlow();
            in_recovery_ = true;
            break;
        }
        case AppEventType::EnterNormal: {
            auto& board = Board::GetInstance();
            board.EnterNormalFlow();
            in_recovery_ = false;
            break;
        }
        case AppEventType::Tick:
        default:
            Tick();
            break;
    }
}

void Application::Tick() {
    auto& board = Board::GetInstance();
    Display* display = board.GetDisplay();
    if (display != nullptr) {
        display->UpdateStatusBar(false);
    }

    int level = 0;
    bool charging = false;
    bool discharging = false;
    const bool ok = board.GetBatteryLevel(level, charging, discharging);
    if (!ok) {
        return;
    }
    if (charging) {
        low_battery_notified_ = false;
        return;
    }
    if (!low_battery_notified_ && level >= 0 && level <= 10) {
        if (display != nullptr) {
            display->ShowNotification("低电量，请充电", 3000);
        }
        low_battery_notified_ = true;
    }
}

void Application::PlaySound(const std::string_view& sound) {
    audio_service_.PlaySound(sound);
}

void Application::PlaySound(const std::string_view& sound, int duration_ms) {
    audio_service_.PlaySound(sound, duration_ms);
}

void Application::MuteSound() {
    audio_service_.MuteOutput();
}

void Application::StopSound() {
    audio_service_.ResetDecoder();
}

bool Application::CanEnterSleepMode() const {
    return false;
}
