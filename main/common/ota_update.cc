#include "common/ota_update.h"

#include "pages/f1_page_adapter_net.h"
#include "settings.h"
#include "common/sleep_manager.h"
#include "board.h"
#include "system_info.h"
#include "backend_url.h"

#include <cJSON.h>
#include <esp_app_desc.h>
#include <esp_log.h>
#include <esp_ota_ops.h>
#include <esp_system.h>
#include <esp_timer.h>
#include <esp_http_client.h>

#include <algorithm>
#include <cctype>
#include <cstring>
#include <vector>

#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/semphr.h"
#include "freertos/task.h"

namespace {

constexpr char kTag[] = "OtaUpdate";

static int64_t NowMs() {
    return esp_timer_get_time() / 1000;
}

static std::string NormalizeUrl(std::string s) {
    s = TrimUrl(std::move(s));
    while (!s.empty() && s.back() == '/') {
        s.pop_back();
    }
    return s;
}

static int32_t GetIntFromJson(cJSON* obj, const char* key, int32_t def) {
    cJSON* it = cJSON_GetObjectItem(obj, key);
    if (cJSON_IsNumber(it)) {
        return static_cast<int32_t>(it->valuedouble);
    }
    return def;
}

static std::string GetStringFromJson(cJSON* obj, const char* key) {
    cJSON* it = cJSON_GetObjectItem(obj, key);
    if (cJSON_IsString(it) && it->valuestring) {
        return std::string(it->valuestring);
    }
    return "";
}

}  // namespace

OtaUpdateService& OtaUpdateService::Instance() {
    static OtaUpdateService inst;
    return inst;
}

void OtaUpdateService::NotifyNetworkConnected() {
    {
        if (mu_ == nullptr) {
            mu_ = xSemaphoreCreateRecursiveMutex();
        }
        if (mu_ != nullptr) {
            (void)xSemaphoreTakeRecursive(mu_, portMAX_DELAY);
        }
        net_connected_ = true;
        check_requested_ = true;
        if (mu_ != nullptr) {
            (void)xSemaphoreGiveRecursive(mu_);
        }
    }
    RequestCheck(false);
}

void OtaUpdateService::NotifyNetworkDisconnected() {
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

void OtaUpdateService::RequestCheck(bool force) {
    if (mu_ == nullptr) {
        mu_ = xSemaphoreCreateRecursiveMutex();
    }
    if (queue_ == nullptr) {
        queue_ = xQueueCreate(4, sizeof(uint8_t));
    }
    if (task_ == nullptr) {
        (void)xTaskCreate(&OtaUpdateService::WorkerTask, "ota", 8192, this, 4, nullptr);
        task_ = reinterpret_cast<void*>(1);
    }
    if (mu_ != nullptr) {
        (void)xSemaphoreTakeRecursive(mu_, portMAX_DELAY);
    }
    check_requested_ = true;
    if (force) {
        force_check_requested_ = true;
    }
    if (mu_ != nullptr) {
        (void)xSemaphoreGiveRecursive(mu_);
    }
    if (queue_ != nullptr) {
        uint8_t v = 1;
        (void)xQueueSend(static_cast<QueueHandle_t>(queue_), &v, 0);
    }
}

void OtaUpdateService::RequestUpdateNow() {
    RequestCheck(true);
    if (mu_ != nullptr) {
        (void)xSemaphoreTakeRecursive(mu_, portMAX_DELAY);
    }
    update_requested_ = true;
    if (mu_ != nullptr) {
        (void)xSemaphoreGiveRecursive(mu_);
    }
    if (queue_ != nullptr) {
        uint8_t v = 2;
        (void)xQueueSend(static_cast<QueueHandle_t>(queue_), &v, 0);
    }
}

OtaSnapshot OtaUpdateService::GetSnapshot() const {
    if (mu_ == nullptr) {
        return snap_;
    }
    (void)xSemaphoreTakeRecursive(mu_, portMAX_DELAY);
    OtaSnapshot copy = snap_;
    (void)xSemaphoreGiveRecursive(mu_);
    return copy;
}

void OtaUpdateService::WorkerTask(void* arg) {
    auto* self = static_cast<OtaUpdateService*>(arg);
    if (self == nullptr) {
        vTaskDelete(nullptr);
        return;
    }
    self->WorkerLoop();
    vTaskDelete(nullptr);
}

void OtaUpdateService::WorkerLoop() {
    for (;;) {
        uint8_t v = 0;
        if (queue_ != nullptr) {
            (void)xQueueReceive(static_cast<QueueHandle_t>(queue_), &v, pdMS_TO_TICKS(2000));
        } else {
            vTaskDelay(pdMS_TO_TICKS(2000));
        }

        if (mu_ != nullptr) {
            (void)xSemaphoreTakeRecursive(mu_, portMAX_DELAY);
        }
        const bool connected = net_connected_;
        const bool force = force_check_requested_;
        const bool need_check = check_requested_;
        const bool need_update = update_requested_;
        const int64_t now_ms = NowMs();
        const bool auto_check_ok = ShouldAutoCheckLocked(now_ms);
        if (mu_ != nullptr) {
            (void)xSemaphoreGiveRecursive(mu_);
        }

        if (!connected) {
            continue;
        }
        if ((need_check && (force || auto_check_ok)) || (!need_check && auto_check_ok)) {
            (void)CheckOnceLocked(now_ms, force);
        }

        if (need_update) {
            if (mu_ != nullptr) {
                (void)xSemaphoreTakeRecursive(mu_, portMAX_DELAY);
            }
            const bool available = snap_.state == OtaState::UpdateAvailable;
            if (mu_ != nullptr) {
                (void)xSemaphoreGiveRecursive(mu_);
            }
            if (available) {
                (void)DownloadAndApplyLocked();
            }
        }
    }
}

bool OtaUpdateService::ShouldAutoCheckLocked(int64_t now_ms) const {
    Settings s("ota", false);
    const int interval_ms = s.GetInt("check_interval_ms", 6 * 60 * 60 * 1000);
    if (interval_ms <= 0) {
        return false;
    }
    if (snap_.last_check_ms <= 0) {
        return true;
    }
    return (now_ms - snap_.last_check_ms) >= interval_ms;
}

bool OtaUpdateService::BuildManifestUrlLocked(std::string& out) {
    Settings s("wifi", false);
    std::string base = s.GetString("ota_url", "");
    if (base.empty()) {
#ifdef CONFIG_OTA_URL
        base = CONFIG_OTA_URL;
#endif
    }
    if (base.empty()) {
        base = GetBackendBaseUrl();
    }
    base = NormalizeUrl(base);
    if (base.empty()) {
        return false;
    }
    if (base.size() >= 5 && base.rfind(".json") == base.size() - 5) {
        out = base;
        return true;
    }
    if (base.size() >= 7 && base.rfind("/update") == base.size() - 7) {
        out = base + "/manifest.json";
        return true;
    }
    out = base + "/update/manifest.json";
    return true;
}

bool OtaUpdateService::CheckOnceLocked(int64_t now_ms, bool force) {
    sm_set_busy(SleepBusySrc::Net, true);
    if (mu_ != nullptr) {
        (void)xSemaphoreTakeRecursive(mu_, portMAX_DELAY);
    }
    check_requested_ = false;
    force_check_requested_ = false;
    snap_.last_check_ms = now_ms;
    snap_.current_version = GetCurrentVersion();
    snap_.last_error = 0;
    snap_.last_http_status = 0;
    snap_.progress_pct = -1;
    snap_.target_version.clear();
    snap_.bin_url.clear();
    snap_.manifest_url.clear();
    SetStateLocked(OtaState::Checking);
    std::string manifest_url;
    const bool ok_url = BuildManifestUrlLocked(manifest_url);
    if (ok_url) {
        snap_.manifest_url = manifest_url;
    }
    if (mu_ != nullptr) {
        (void)xSemaphoreGiveRecursive(mu_);
    }
    if (!ok_url) {
        FailLocked(ESP_ERR_INVALID_ARG, 0);
        sm_set_busy(SleepBusySrc::Net, false);
        return false;
    }

    std::vector<uint8_t> bytes;
    int status = 0;
    std::string final_url;
    if (!HttpGetToBufferEx(manifest_url, bytes, 8192, &status, &final_url, nullptr)) {
        FailLocked(ESP_FAIL, status);
        sm_set_busy(SleepBusySrc::Net, false);
        return false;
    }

    std::string body(bytes.begin(), bytes.end());
    cJSON* root = cJSON_ParseWithLength(body.c_str(), body.size());
    if (root == nullptr) {
        FailLocked(ESP_ERR_INVALID_RESPONSE, status);
        sm_set_busy(SleepBusySrc::Net, false);
        return false;
    }

    const std::string version = TrimUrl(GetStringFromJson(root, "version"));
    std::string bin_url = TrimUrl(GetStringFromJson(root, "bin_url"));
    const std::string board = TrimUrl(GetStringFromJson(root, "board"));
    cJSON_Delete(root);

    if (version.empty() || bin_url.empty()) {
        FailLocked(ESP_ERR_INVALID_RESPONSE, status);
        sm_set_busy(SleepBusySrc::Net, false);
        return false;
    }

    const std::string manifest_base = BaseUrlFromApiUrl(final_url.empty() ? manifest_url : final_url);
    bin_url = JoinUrl(manifest_base, bin_url);
    if (!board.empty() && board != std::string(BOARD_NAME)) {
        FailLocked(ESP_ERR_INVALID_STATE, status);
        sm_set_busy(SleepBusySrc::Net, false);
        return false;
    }

    const std::string cur = GetCurrentVersion();
    const int cmp = CompareVersion(version, cur);
    if (mu_ != nullptr) {
        (void)xSemaphoreTakeRecursive(mu_, portMAX_DELAY);
    }
    snap_.last_http_status = status;
    snap_.current_version = cur;
    snap_.target_version = version;
    snap_.bin_url = bin_url;
    snap_.progress_pct = -1;
    if (mu_ != nullptr) {
        (void)xSemaphoreGiveRecursive(mu_);
    }

    if (cmp <= 0) {
        SetStateLocked(OtaState::Idle);
        sm_set_busy(SleepBusySrc::Net, false);
        return true;
    }

    Settings ota("ota", false);
    const bool auto_apply = ota.GetBool("auto_apply", true);
    SetStateLocked(OtaState::UpdateAvailable);
    sm_set_busy(SleepBusySrc::Net, false);
    if (auto_apply) {
        if (mu_ != nullptr) {
            (void)xSemaphoreTakeRecursive(mu_, portMAX_DELAY);
        }
        update_requested_ = true;
        if (mu_ != nullptr) {
            (void)xSemaphoreGiveRecursive(mu_);
        }
    }
    return true;
}

bool OtaUpdateService::DownloadAndApplyLocked() {
    sm_set_busy(SleepBusySrc::Net, true);
    sm_hold("ota");
    SetStateLocked(OtaState::Downloading);

    OtaSnapshot s = GetSnapshot();
    std::string bin_url = s.bin_url;
    bin_url = TrimUrl(bin_url);
    if (bin_url.empty()) {
        FailLocked(ESP_ERR_INVALID_ARG, 0);
        sm_release("ota");
        sm_set_busy(SleepBusySrc::Net, false);
        return false;
    }

    Settings ota("ota", false);
    const int min_batt = ota.GetInt("min_batt_pct", 30);
    auto& board = Board::GetInstance();
    int level = 0;
    bool charging = false;
    bool discharging = false;
    if (board.GetBatteryLevel(level, charging, discharging)) {
        if (!charging && level >= 0 && level < min_batt) {
            FailLocked(ESP_ERR_INVALID_STATE, 0);
            sm_release("ota");
            sm_set_busy(SleepBusySrc::Net, false);
            return false;
        }
    }

    const esp_partition_t* update_partition = esp_ota_get_next_update_partition(nullptr);
    if (update_partition == nullptr) {
        FailLocked(ESP_ERR_NOT_FOUND, 0);
        sm_release("ota");
        sm_set_busy(SleepBusySrc::Net, false);
        return false;
    }

    esp_http_client_config_t config = {};
    config.url = bin_url.c_str();
    config.timeout_ms = 20000;
    config.method = HTTP_METHOD_GET;
    config.user_agent = SystemInfo::GetUserAgent().c_str();
    config.keep_alive_enable = false;

    esp_http_client_handle_t client = esp_http_client_init(&config);
    if (client == nullptr) {
        FailLocked(ESP_ERR_NO_MEM, 0);
        sm_release("ota");
        sm_set_busy(SleepBusySrc::Net, false);
        return false;
    }

    if (esp_http_client_open(client, 0) != ESP_OK) {
        esp_http_client_cleanup(client);
        FailLocked(ESP_FAIL, 0);
        sm_release("ota");
        sm_set_busy(SleepBusySrc::Net, false);
        return false;
    }

    const int64_t cl = esp_http_client_fetch_headers(client);
    const int http_status = esp_http_client_get_status_code(client);
    if (http_status != 200) {
        esp_http_client_close(client);
        esp_http_client_cleanup(client);
        FailLocked(ESP_FAIL, http_status);
        sm_release("ota");
        sm_set_busy(SleepBusySrc::Net, false);
        return false;
    }

    esp_ota_handle_t handle = 0;
    if (esp_ota_begin(update_partition, OTA_SIZE_UNKNOWN, &handle) != ESP_OK) {
        esp_http_client_close(client);
        esp_http_client_cleanup(client);
        FailLocked(ESP_FAIL, http_status);
        sm_release("ota");
        sm_set_busy(SleepBusySrc::Net, false);
        return false;
    }

    std::vector<uint8_t> buf;
    buf.resize(1024);
    int64_t total = 0;
    int empty_reads = 0;
    constexpr int kMaxEmptyReads = 200;
    while (true) {
        const int r = esp_http_client_read(client, reinterpret_cast<char*>(buf.data()), buf.size());
        if (r < 0) {
            esp_ota_end(handle);
            esp_http_client_close(client);
            esp_http_client_cleanup(client);
            FailLocked(ESP_FAIL, http_status);
            sm_release("ota");
            sm_set_busy(SleepBusySrc::Net, false);
            return false;
        }
        if (r == 0) {
            empty_reads++;
            if (esp_http_client_is_complete_data_received(client)) {
                break;
            }
            if (empty_reads > kMaxEmptyReads) {
                esp_ota_end(handle);
                esp_http_client_close(client);
                esp_http_client_cleanup(client);
                FailLocked(ESP_ERR_TIMEOUT, http_status);
                sm_release("ota");
                sm_set_busy(SleepBusySrc::Net, false);
                return false;
            }
            vTaskDelay(pdMS_TO_TICKS(20));
            continue;
        }
        empty_reads = 0;
        total += r;
        if (esp_ota_write(handle, buf.data(), r) != ESP_OK) {
            esp_ota_end(handle);
            esp_http_client_close(client);
            esp_http_client_cleanup(client);
            FailLocked(ESP_FAIL, http_status);
            sm_release("ota");
            sm_set_busy(SleepBusySrc::Net, false);
            return false;
        }
        if (cl > 0) {
            const int pct = static_cast<int>((total * 100) / cl);
            SetProgressLocked(std::clamp(pct, 0, 99));
        }
    }

    esp_http_client_close(client);
    esp_http_client_cleanup(client);

    if (esp_ota_end(handle) != ESP_OK) {
        FailLocked(ESP_FAIL, http_status);
        sm_release("ota");
        sm_set_busy(SleepBusySrc::Net, false);
        return false;
    }

    SetProgressLocked(100);
    SetStateLocked(OtaState::Applying);
    if (esp_ota_set_boot_partition(update_partition) != ESP_OK) {
        FailLocked(ESP_FAIL, http_status);
        sm_release("ota");
        sm_set_busy(SleepBusySrc::Net, false);
        return false;
    }

    if (mu_ != nullptr) {
        (void)xSemaphoreTakeRecursive(mu_, portMAX_DELAY);
    }
    update_requested_ = false;
    snap_.last_update_ms = NowMs();
    if (mu_ != nullptr) {
        (void)xSemaphoreGiveRecursive(mu_);
    }

    SetStateLocked(OtaState::Succeeded);
    sm_release("ota");
    sm_set_busy(SleepBusySrc::Net, false);
    vTaskDelay(pdMS_TO_TICKS(500));
    esp_restart();
    return true;
}

void OtaUpdateService::SetStateLocked(OtaState s) {
    if (mu_ != nullptr) {
        (void)xSemaphoreTakeRecursive(mu_, portMAX_DELAY);
    }
    snap_.state = s;
    if (mu_ != nullptr) {
        (void)xSemaphoreGiveRecursive(mu_);
    }
}

void OtaUpdateService::FailLocked(int err, int http_status) {
    if (mu_ != nullptr) {
        (void)xSemaphoreTakeRecursive(mu_, portMAX_DELAY);
    }
    snap_.state = OtaState::Failed;
    snap_.last_error = err;
    snap_.last_http_status = http_status;
    snap_.progress_pct = -1;
    update_requested_ = false;
    if (mu_ != nullptr) {
        (void)xSemaphoreGiveRecursive(mu_);
    }
    ESP_LOGW(kTag, "failed err=%d http=%d", err, http_status);
}

void OtaUpdateService::SetProgressLocked(int pct) {
    if (mu_ != nullptr) {
        (void)xSemaphoreTakeRecursive(mu_, portMAX_DELAY);
    }
    snap_.progress_pct = pct;
    if (mu_ != nullptr) {
        (void)xSemaphoreGiveRecursive(mu_);
    }
}

int OtaUpdateService::CompareVersion(const std::string& a, const std::string& b) {
    auto split = [](const std::string& s) {
        std::vector<int> out;
        std::string cur;
        for (char c : s) {
            if ((c >= '0' && c <= '9')) {
                cur.push_back(c);
                continue;
            }
            if (c == '.') {
                if (!cur.empty()) {
                    out.push_back(std::stoi(cur));
                    cur.clear();
                } else {
                    out.push_back(0);
                }
                continue;
            }
            break;
        }
        if (!cur.empty()) {
            out.push_back(std::stoi(cur));
        }
        return out;
    };
    std::vector<int> va = split(a);
    std::vector<int> vb = split(b);
    const size_t n = std::max(va.size(), vb.size());
    va.resize(n, 0);
    vb.resize(n, 0);
    for (size_t i = 0; i < n; i++) {
        if (va[i] < vb[i]) return -1;
        if (va[i] > vb[i]) return 1;
    }
    return 0;
}

std::string OtaUpdateService::GetCurrentVersion() {
    auto app_desc = esp_app_get_description();
    if (app_desc == nullptr || app_desc->version[0] == 0) {
        return "0.0.0";
    }
    return std::string(app_desc->version);
}
