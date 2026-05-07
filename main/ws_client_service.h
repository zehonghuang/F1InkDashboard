#ifndef WS_CLIENT_SERVICE_H
#define WS_CLIENT_SERVICE_H

#include <atomic>
#include <cstdint>
#include <memory>
#include <string>

#include <freertos/FreeRTOS.h>
#include <freertos/event_groups.h>
#include <freertos/task.h>

class LcdDisplay;

class WsClientService {
public:
    enum class Mode : uint8_t {
        OpenF1 = 0,
        News = 1,
    };

    explicit WsClientService(LcdDisplay* display, Mode mode);
    ~WsClientService();

    void Start(const std::string& url);
    void Stop();
    bool IsRunning() const;

private:
    static void TaskEntry(void* arg);
    void TaskLoop();
    void HandleIncomingText(const std::string& text);
    void ShowOverlay(const std::string& text);
    std::string ResolveUrl();

    LcdDisplay* display_ = nullptr;
    Mode mode_{Mode::OpenF1};
    std::atomic<bool> stop_{false};
    std::atomic<bool> running_{false};
    TaskHandle_t task_ = nullptr;
    EventGroupHandle_t event_group_ = nullptr;
    std::string url_;
};

#endif  // WS_CLIENT_SERVICE_H
