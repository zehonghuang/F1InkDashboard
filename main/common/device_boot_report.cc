#include "common/device_boot_report.h"

#include "backend_url.h"
#include "board.h"
#include "display/pages/f1_page_adapter_net.h"
#include "settings.h"
#include "system_info.h"
#include "wifi_manager.h"

#include <cJSON.h>
#include <esp_crt_bundle.h>
#include <esp_http_client.h>
#include <esp_log.h>
#include <esp_timer.h>

#include "freertos/task.h"

namespace {

constexpr char kTag[] = "DeviceBootReport";

static int64_t NowMs() {
    return esp_timer_get_time() / 1000;
}

static std::string GetDeviceId() {
    return WifiManager::GetInstance().GetDeviceId();
}

static constexpr const char* kBootReportedKey = "dev_id_rep";

static bool HasReported() {
    Settings boot("boot", false);
    return boot.GetBool(kBootReportedKey, false);
}

static void MarkReported() {
    Settings boot("boot", true);
    boot.SetBool(kBootReportedKey, true);
}

static bool PostOnce() {
    const std::string device_id = GetDeviceId();
    if (device_id.empty()) {
        return false;
    }

    auto& board = Board::GetInstance();
    const std::string url = JoinUrl(GetBackendBaseUrl(), "/api/v1/device/boot");

    cJSON* root = cJSON_CreateObject();
    if (root == nullptr) {
        return false;
    }

    (void)cJSON_AddStringToObject(root, "device_id", device_id.c_str());

    const std::string device_uuid = board.GetUuid();
    if (!device_uuid.empty()) {
        (void)cJSON_AddStringToObject(root, "device_uuid", device_uuid.c_str());
    }
    const std::string device_key = board.GetDeviceKey();
    if (!device_key.empty()) {
        (void)cJSON_AddStringToObject(root, "device_key", device_key.c_str());
    }
    const std::string mac = SystemInfo::GetMacAddress();
    if (!mac.empty()) {
        (void)cJSON_AddStringToObject(root, "mac", mac.c_str());
    }

    const std::string board_type = board.GetBoardType();
    if (!board_type.empty()) {
        (void)cJSON_AddStringToObject(root, "board_type", board_type.c_str());
    }
    const std::string ua = SystemInfo::GetUserAgent();
    if (!ua.empty()) {
        (void)cJSON_AddStringToObject(root, "fw_user_agent", ua.c_str());
    }

    char* body_raw = cJSON_PrintUnformatted(root);
    cJSON_Delete(root);
    if (body_raw == nullptr) {
        return false;
    }
    std::string body(body_raw);
    free(body_raw);
    if (body.empty()) {
        return false;
    }

    esp_http_client_config_t cfg = {};
    cfg.url = url.c_str();
    cfg.timeout_ms = 15000;
    cfg.method = HTTP_METHOD_POST;
    cfg.user_agent = ua.empty() ? nullptr : ua.c_str();
    cfg.keep_alive_enable = false;
    cfg.crt_bundle_attach = esp_crt_bundle_attach;

    esp_http_client_handle_t client = esp_http_client_init(&cfg);
    if (client == nullptr) {
        return false;
    }

    esp_http_client_set_header(client, "Content-Type", "application/json");
    esp_http_client_set_post_field(client, body.data(), static_cast<int>(body.size()));

    esp_err_t err = esp_http_client_perform(client);
    const int status = esp_http_client_get_status_code(client);
    esp_http_client_cleanup(client);

    if (err != ESP_OK) {
        return false;
    }
    return status == 200;
}

}  // namespace

DeviceBootReportService& DeviceBootReportService::Instance() {
    static DeviceBootReportService inst;
    return inst;
}

void DeviceBootReportService::NotifyNetworkConnected() {
    if (mu_ == nullptr) {
        mu_ = xSemaphoreCreateRecursiveMutex();
    }
    if (queue_ == nullptr) {
        queue_ = xQueueCreate(4, sizeof(uint8_t));
    }
    if (task_ == nullptr) {
        (void)xTaskCreate(&DeviceBootReportService::WorkerTask, "dev_boot", 6144, this, 3, nullptr);
        task_ = reinterpret_cast<void*>(1);
    }

    if (mu_ != nullptr) {
        (void)xSemaphoreTakeRecursive(mu_, portMAX_DELAY);
    }
    net_connected_ = true;
    if (next_try_ms_ <= 0) {
        next_try_ms_ = NowMs();
    }
    if (mu_ != nullptr) {
        (void)xSemaphoreGiveRecursive(mu_);
    }

    if (queue_ != nullptr) {
        uint8_t v = 1;
        (void)xQueueSend(queue_, &v, 0);
    }
}

void DeviceBootReportService::NotifyNetworkDisconnected() {
    if (mu_ == nullptr) {
        mu_ = xSemaphoreCreateRecursiveMutex();
    }
    if (mu_ != nullptr) {
        (void)xSemaphoreTakeRecursive(mu_, portMAX_DELAY);
    }
    net_connected_ = false;
    if (mu_ != nullptr) {
        (void)xSemaphoreGiveRecursive(mu_);
    }
}

void DeviceBootReportService::WorkerTask(void* arg) {
    auto* self = static_cast<DeviceBootReportService*>(arg);
    if (self == nullptr) {
        vTaskDelete(nullptr);
        return;
    }
    self->WorkerLoop();
    vTaskDelete(nullptr);
}

void DeviceBootReportService::WorkerLoop() {
    for (;;) {
        uint8_t v = 0;
        if (queue_ != nullptr) {
            (void)xQueueReceive(queue_, &v, pdMS_TO_TICKS(2000));
        } else {
            vTaskDelay(pdMS_TO_TICKS(2000));
        }

        if (HasReported()) {
            vTaskDelay(pdMS_TO_TICKS(60000));
            continue;
        }

        if (mu_ != nullptr) {
            (void)xSemaphoreTakeRecursive(mu_, portMAX_DELAY);
        }
        const bool connected = net_connected_;
        const int64_t next_try_ms = next_try_ms_;
        const int backoff_ms = backoff_ms_;
        if (mu_ != nullptr) {
            (void)xSemaphoreGiveRecursive(mu_);
        }

        if (!connected) {
            continue;
        }

        const int64_t now = NowMs();
        if (next_try_ms > 0 && now < next_try_ms) {
            vTaskDelay(pdMS_TO_TICKS(1000));
            continue;
        }

        bool ok = PostOnce();

        if (mu_ != nullptr) {
            (void)xSemaphoreTakeRecursive(mu_, portMAX_DELAY);
        }
        if (ok) {
            ESP_LOGI(kTag, "boot_report ok");
            MarkReported();
            backoff_ms_ = 5000;
            next_try_ms_ = 0;
            if (mu_ != nullptr) {
                (void)xSemaphoreGiveRecursive(mu_);
            }
            vTaskDelay(pdMS_TO_TICKS(60000));
            continue;
        }

        ESP_LOGW(kTag, "boot_report failed");
        next_try_ms_ = now + backoff_ms;
        if (backoff_ms_ < 10 * 60 * 1000) {
            backoff_ms_ *= 2;
            if (backoff_ms_ > 10 * 60 * 1000) {
                backoff_ms_ = 10 * 60 * 1000;
            }
        }
        if (mu_ != nullptr) {
            (void)xSemaphoreGiveRecursive(mu_);
        }
    }
}
