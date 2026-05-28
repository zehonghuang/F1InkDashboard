#include "common/user_prefs_kv.h"

#include "backend_url.h"
#include "common/json_utils.h"
#include "display/pages/f1_page_adapter_net.h"
#include "settings.h"
#include "wifi_manager.h"

#include <cJSON.h>
#include <esp_log.h>
#include <esp_timer.h>

#include <memory>

namespace {

constexpr char kTag[] = "UserPrefsKV";

static int64_t NowMs() {
    return esp_timer_get_time() / 1000;
}

static std::string GetDeviceId() {
    return WifiManager::GetInstance().GetDeviceId();
}

static std::string UserPrefsUrlFromBase(const std::string& base, const std::string& device_id) {
    if (base.empty() || device_id.empty()) {
        return {};
    }
    std::string path = "/api/v1/device/";
    path += device_id;
    path += "/user_prefs_kv";
    return TrimUrl(JoinUrl(base, path));
}

static std::vector<std::string> ParseStringArray(cJSON* arr) {
    std::vector<std::string> out;
    if (arr == nullptr || !cJSON_IsArray(arr)) {
        return out;
    }
    const int n = cJSON_GetArraySize(arr);
    for (int i = 0; i < n; i++) {
        cJSON* it = cJSON_GetArrayItem(arr, i);
        if (!cJSON_IsString(it) || it->valuestring == nullptr) {
            continue;
        }
        std::string s = it->valuestring;
        if (!s.empty()) {
            out.push_back(std::move(s));
        }
        if (out.size() >= 12) {
            break;
        }
    }
    return out;
}

static std::vector<int> ParseIntArray(cJSON* arr) {
    std::vector<int> out;
    if (arr == nullptr || !cJSON_IsArray(arr)) {
        return out;
    }
    const int n = cJSON_GetArraySize(arr);
    for (int i = 0; i < n; i++) {
        cJSON* it = cJSON_GetArrayItem(arr, i);
        if (!cJSON_IsNumber(it)) {
            continue;
        }
        const int v = it->valueint;
        if (v <= 0 || v > 999) {
            continue;
        }
        out.push_back(v);
        if (out.size() >= 12) {
            break;
        }
    }
    return out;
}

static std::string JsonStringifyStringArray(const std::vector<std::string>& arr) {
    cJSON* root = cJSON_CreateArray();
    if (root == nullptr) {
        return "[]";
    }
    for (const auto& s : arr) {
        if (s.empty()) {
            continue;
        }
        (void)cJSON_AddItemToArray(root, cJSON_CreateString(s.c_str()));
    }
    char* raw = cJSON_PrintUnformatted(root);
    cJSON_Delete(root);
    if (raw == nullptr) {
        return "[]";
    }
    std::string out(raw);
    free(raw);
    return out.empty() ? "[]" : out;
}

static std::string JsonStringifyIntArray(const std::vector<int>& arr) {
    cJSON* root = cJSON_CreateArray();
    if (root == nullptr) {
        return "[]";
    }
    for (int v : arr) {
        if (v <= 0 || v > 999) {
            continue;
        }
        (void)cJSON_AddItemToArray(root, cJSON_CreateNumber(v));
    }
    char* raw = cJSON_PrintUnformatted(root);
    cJSON_Delete(root);
    if (raw == nullptr) {
        return "[]";
    }
    std::string out(raw);
    free(raw);
    return out.empty() ? "[]" : out;
}

static bool FetchOnce(UserPrefsKV& out, int* out_status) {
    out = UserPrefsKV{};
    if (out_status) {
        *out_status = 0;
    }

    const std::string device_id = GetDeviceId();
    if (device_id.empty()) {
        return false;
    }

    std::string base = GetBackendBaseUrl();
    base = TrimUrl(std::move(base));
    if (base.empty()) {
        return false;
    }
    const std::string url = UserPrefsUrlFromBase(base, device_id);
    if (url.empty()) {
        return false;
    }

    int status = 0;
    std::vector<uint8_t> bytes;
    const bool ok = HttpGetToBufferEx(url, bytes, 8192, &status, nullptr, nullptr);
    if (out_status) {
        *out_status = status;
    }
    if (!ok) {
        return false;
    }

    cJSON* root = cJSON_ParseWithLength(reinterpret_cast<const char*>(bytes.data()), bytes.size());
    if (root == nullptr) {
        return false;
    }

    if (!JsonGetBoolTrue(root, "ok")) {
        cJSON_Delete(root);
        return false;
    }

    cJSON* kv = JsonGetObj(root, "kv");
    if (kv == nullptr) {
        cJSON_Delete(root);
        return false;
    }

    out.nick = JsonGetStringOrEmpty(kv, "nick");
    out.avatar = JsonGetStringOrEmpty(kv, "avatar");
    out.team = JsonGetStringOrEmpty(kv, "team");
    out.teams = ParseStringArray(JsonGetArr(kv, "teams"));
    out.drivers = ParseIntArray(JsonGetArr(kv, "drivers"));

    cJSON_Delete(root);
    return true;
}

}  // namespace

UserPrefsKVService& UserPrefsKVService::Instance() {
    static UserPrefsKVService inst;
    return inst;
}

void UserPrefsKVService::RequestFetch(bool force) {
    if (mu_ == nullptr) {
        mu_ = xSemaphoreCreateRecursiveMutex();
    }
    if (queue_ == nullptr) {
        queue_ = xQueueCreate(2, sizeof(uint8_t));
    }
    if (task_ == nullptr) {
        (void)xTaskCreate(&UserPrefsKVService::WorkerTask, "user_prefs", 6144, this, 3, nullptr);
        task_ = reinterpret_cast<void*>(1);
    }

    const int64_t now = NowMs();

    if (mu_ != nullptr) {
        (void)xSemaphoreTakeRecursive(mu_, portMAX_DELAY);
    }

    if (!loaded_) {
        LoadFromSettingsLocked();
    }

    if (force) {
        next_regular_fetch_ms_ = 0;
        next_try_ms_ = 0;
        backoff_ms_ = 5000;
    }

    if (inflight_) {
        if (mu_ != nullptr) {
            (void)xSemaphoreGiveRecursive(mu_);
        }
        return;
    }
    if (!force) {
        if (next_regular_fetch_ms_ > 0 && now < next_regular_fetch_ms_) {
            if (mu_ != nullptr) {
                (void)xSemaphoreGiveRecursive(mu_);
            }
            return;
        }
        if (next_try_ms_ > 0 && now < next_try_ms_) {
            if (mu_ != nullptr) {
                (void)xSemaphoreGiveRecursive(mu_);
            }
            return;
        }
    }

    inflight_ = true;
    if (mu_ != nullptr) {
        (void)xSemaphoreGiveRecursive(mu_);
    }

    if (queue_ != nullptr) {
        uint8_t v = force ? 2 : 1;
        if (xQueueSend(queue_, &v, 0) != pdTRUE) {
            if (mu_ != nullptr) {
                (void)xSemaphoreTakeRecursive(mu_, portMAX_DELAY);
            }
            inflight_ = false;
            if (mu_ != nullptr) {
                (void)xSemaphoreGiveRecursive(mu_);
            }
        }
    }
}

UserPrefsKVSnapshot UserPrefsKVService::GetSnapshot() {
    if (mu_ == nullptr) {
        mu_ = xSemaphoreCreateRecursiveMutex();
    }
    if (mu_ != nullptr) {
        (void)xSemaphoreTakeRecursive(mu_, portMAX_DELAY);
    }
    if (!loaded_) {
        LoadFromSettingsLocked();
    }
    UserPrefsKVSnapshot out = snapshot_;
    if (mu_ != nullptr) {
        (void)xSemaphoreGiveRecursive(mu_);
    }
    return out;
}

void UserPrefsKVService::WorkerTask(void* arg) {
    auto* self = static_cast<UserPrefsKVService*>(arg);
    if (self == nullptr) {
        vTaskDelete(nullptr);
        return;
    }
    self->WorkerLoop();
    vTaskDelete(nullptr);
}

void UserPrefsKVService::WorkerLoop() {
    for (;;) {
        uint8_t v = 0;
        if (queue_ != nullptr) {
            (void)xQueueReceive(queue_, &v, portMAX_DELAY);
        } else {
            vTaskDelay(pdMS_TO_TICKS(2000));
            continue;
        }
        const bool force = v == 2;

        const int64_t now = NowMs();
        if (!force) {
            if (mu_ != nullptr) {
                (void)xSemaphoreTakeRecursive(mu_, portMAX_DELAY);
            }
            const int64_t next_regular = next_regular_fetch_ms_;
            const int64_t next_try = next_try_ms_;
            if (mu_ != nullptr) {
                (void)xSemaphoreGiveRecursive(mu_);
            }
            if (next_regular > 0 && now < next_regular) {
                if (mu_ != nullptr) {
                    (void)xSemaphoreTakeRecursive(mu_, portMAX_DELAY);
                }
                inflight_ = false;
                if (mu_ != nullptr) {
                    (void)xSemaphoreGiveRecursive(mu_);
                }
                continue;
            }
            if (next_try > 0 && now < next_try) {
                if (mu_ != nullptr) {
                    (void)xSemaphoreTakeRecursive(mu_, portMAX_DELAY);
                }
                inflight_ = false;
                if (mu_ != nullptr) {
                    (void)xSemaphoreGiveRecursive(mu_);
                }
                continue;
            }
        }

        int status = 0;
        UserPrefsKV kv;
        const bool ok = FetchOnce(kv, &status);

        if (mu_ != nullptr) {
            (void)xSemaphoreTakeRecursive(mu_, portMAX_DELAY);
        }
        if (!loaded_) {
            LoadFromSettingsLocked();
        }

        if (ok) {
            snapshot_.bound = true;
            snapshot_.last_fetch_ms = now;
            snapshot_.last_status = status;
            snapshot_.kv = std::move(kv);
            SaveToSettingsLocked();
            next_regular_fetch_ms_ = now + 30LL * 60LL * 1000LL;
            next_try_ms_ = 0;
            backoff_ms_ = 5000;
            ESP_LOGI(kTag, "fetch ok status=%d", status);
        } else if (status == 404) {
            snapshot_.bound = false;
            snapshot_.last_fetch_ms = now;
            snapshot_.last_status = status;
            snapshot_.kv = UserPrefsKV{};
            ClearSettingsLocked();
            next_regular_fetch_ms_ = now + 10LL * 60LL * 1000LL;
            next_try_ms_ = 0;
            backoff_ms_ = 5000;
            ESP_LOGI(kTag, "not bound");
        } else {
            snapshot_.last_status = status;
            next_try_ms_ = now + backoff_ms_;
            if (backoff_ms_ < 10 * 60 * 1000) {
                backoff_ms_ *= 2;
                if (backoff_ms_ > 10 * 60 * 1000) {
                    backoff_ms_ = 10 * 60 * 1000;
                }
            }
            ESP_LOGW(kTag, "fetch failed status=%d", status);
        }

        inflight_ = false;
        if (mu_ != nullptr) {
            (void)xSemaphoreGiveRecursive(mu_);
        }
    }
}

void UserPrefsKVService::LoadFromSettingsLocked() {
    Settings s("user_prefs", false);
    snapshot_.bound = s.GetBool("bound", false);
    snapshot_.last_fetch_ms = static_cast<int64_t>(s.GetInt("last_fetch_ms", 0));
    snapshot_.last_status = s.GetInt("last_status", 0);
    snapshot_.kv.nick = s.GetString("nick", "");
    snapshot_.kv.avatar = s.GetString("avatar", "");
    snapshot_.kv.team = s.GetString("team", "");

    {
        const std::string teams_raw = s.GetString("teams", "[]");
        cJSON* arr = cJSON_Parse(teams_raw.c_str());
        snapshot_.kv.teams = ParseStringArray(arr);
        if (arr) cJSON_Delete(arr);
    }
    {
        const std::string drivers_raw = s.GetString("drivers", "[]");
        cJSON* arr = cJSON_Parse(drivers_raw.c_str());
        snapshot_.kv.drivers = ParseIntArray(arr);
        if (arr) cJSON_Delete(arr);
    }

    loaded_ = true;
}

void UserPrefsKVService::SaveToSettingsLocked() {
    Settings s("user_prefs", true);
    s.SetBool("bound", snapshot_.bound);
    s.SetInt("last_fetch_ms", static_cast<int32_t>(snapshot_.last_fetch_ms));
    s.SetInt("last_status", snapshot_.last_status);
    s.SetString("nick", snapshot_.kv.nick);
    s.SetString("avatar", snapshot_.kv.avatar);
    s.SetString("team", snapshot_.kv.team);
    s.SetString("teams", JsonStringifyStringArray(snapshot_.kv.teams));
    s.SetString("drivers", JsonStringifyIntArray(snapshot_.kv.drivers));
}

void UserPrefsKVService::ClearSettingsLocked() {
    Settings s("user_prefs", true);
    s.EraseAll();
}
