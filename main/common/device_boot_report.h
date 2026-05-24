#ifndef DEVICE_BOOT_REPORT_H
#define DEVICE_BOOT_REPORT_H

#include <cstdint>

#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/semphr.h"

class DeviceBootReportService {
public:
    static DeviceBootReportService& Instance();

    void NotifyNetworkConnected();
    void NotifyNetworkDisconnected();

private:
    DeviceBootReportService() = default;
    ~DeviceBootReportService() = default;
    DeviceBootReportService(const DeviceBootReportService&) = delete;
    DeviceBootReportService& operator=(const DeviceBootReportService&) = delete;

    static void WorkerTask(void* arg);
    void WorkerLoop();

    void* task_ = nullptr;
    QueueHandle_t queue_ = nullptr;
    SemaphoreHandle_t mu_ = nullptr;

    bool net_connected_ = false;
    int64_t next_try_ms_ = 0;
    int backoff_ms_ = 5000;
};

#endif  // DEVICE_BOOT_REPORT_H
