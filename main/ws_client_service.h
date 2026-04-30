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
    explicit WsClientService(LcdDisplay* display);
    ~WsClientService();

    void Start(const std::string& url);
    void Stop();
    bool IsRunning() const;

private:
    static void TaskEntry(void* arg);
    void TaskLoop();
    void HandleIncomingText(const std::string& text);
    void ShowOverlay(const std::string& text);

    LcdDisplay* display_ = nullptr;
    std::atomic<bool> stop_{false};
    std::atomic<bool> running_{false};
    TaskHandle_t task_ = nullptr;
    EventGroupHandle_t event_group_ = nullptr;
    std::string url_;
};

#endif  // WS_CLIENT_SERVICE_H
