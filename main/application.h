#ifndef _APPLICATION_H_
#define _APPLICATION_H_

#include <atomic>
#include <functional>
#include <string_view>

#include "audio_service.h"
#include "device_state.h"

class Application {
public:
    static Application& GetInstance() {
        static Application instance;
        return instance;
    }

    Application(const Application&) = delete;
    Application& operator=(const Application&) = delete;

    void Initialize();
    void Run();

    DeviceState GetDeviceState() const { return state_.load(std::memory_order_acquire); }
    bool SetDeviceState(DeviceState state);

    void Schedule(std::function<void()>&& callback);
    void PlaySound(const std::string_view& sound);
    void PlaySound(const std::string_view& sound, int duration_ms);
    void MuteSound();
    void StopSound();
    bool CanEnterSleepMode() const;

    void NotifyNetworkConnected();
    void NotifyNetworkDisconnected();
    void RequestRecoveryMode();
    void RequestNormalMode();

    AudioService& GetAudioService() { return audio_service_; }

private:
    Application();
    ~Application();

    enum class AppEventType : uint8_t {
        Tick = 0,
        NetworkConnected = 1,
        NetworkDisconnected = 2,
        EnterRecovery = 3,
        EnterNormal = 4,
    };

    struct AppEvent {
        AppEventType type = AppEventType::Tick;
        int32_t arg = 0;
    };

    void PostEvent(AppEventType type, int32_t arg = 0);
    void HandleEvent(const AppEvent& e);
    void Tick();

    std::atomic<DeviceState> state_{kDeviceStateUnknown};
    AudioService audio_service_;
    void* event_queue_ = nullptr;
    int64_t last_connected_ms_ = 0;
    int64_t last_disconnect_ms_ = 0;
    int disconnect_burst_ = 0;
    bool low_battery_notified_ = false;
    bool in_recovery_ = false;
};

#endif  // _APPLICATION_H_
