#include "http_fetch.h"

#include "common/url_utils.h"
#include "i18n.h"

#include <esp_crt_bundle.h>
#include <esp_http_client.h>

#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "freertos/task.h"

namespace {

StaticSemaphore_t g_http_mu_buf;
SemaphoreHandle_t g_http_mu = xSemaphoreCreateMutexStatic(&g_http_mu_buf);

struct HttpLockGuard {
    HttpLockGuard() {
        if (g_http_mu != nullptr) {
            (void)xSemaphoreTake(g_http_mu, portMAX_DELAY);
        }
    }
    ~HttpLockGuard() {
        if (g_http_mu != nullptr) {
            (void)xSemaphoreGive(g_http_mu);
        }
    }
    HttpLockGuard(const HttpLockGuard&) = delete;
    HttpLockGuard& operator=(const HttpLockGuard&) = delete;
};

}  // namespace

bool HttpGetToBufferEx(const std::string& url,
                       std::vector<uint8_t>& out,
                       size_t max_bytes,
                       int* out_status,
                       std::string* out_final_url,
                       std::string* out_content_type) {
    HttpLockGuard guard;
    out.clear();
    if (out_status) {
        *out_status = 0;
    }
    if (out_final_url) {
        *out_final_url = url;
    }
    if (out_content_type) {
        out_content_type->clear();
    }

    std::string current = url;
    for (int redirect = 0; redirect < 2; redirect++) {
        esp_http_client_config_t config = {};
        config.url = current.c_str();
        config.timeout_ms = 20000;
        config.method = HTTP_METHOD_GET;
        config.user_agent = "zectrix-fw/0.1";
        config.keep_alive_enable = false;
        config.crt_bundle_attach = esp_crt_bundle_attach;

        esp_http_client_handle_t client = esp_http_client_init(&config);
        if (client == nullptr) {
            return false;
        }
        {
            const std::string lang = I18n::GetLanguage();
            if (!lang.empty()) {
                esp_http_client_set_header(client, "Accept-Language", lang.c_str());
            }
        }

        const esp_err_t open_ret = esp_http_client_open(client, 0);
        if (open_ret != ESP_OK) {
            esp_http_client_cleanup(client);
            return false;
        }

        int64_t cl = esp_http_client_fetch_headers(client);
        const int status = esp_http_client_get_status_code(client);
        if (out_status) {
            *out_status = status;
        }
        if (out_final_url) {
            *out_final_url = current;
        }
        if (out_content_type) {
            char* ct = nullptr;
            if (esp_http_client_get_header(client, "Content-Type", &ct) == ESP_OK && ct != nullptr) {
                *out_content_type = ct;
            } else {
                out_content_type->clear();
            }
        }

        if (status == 301 || status == 302 || status == 303 || status == 307 || status == 308) {
            char* location = nullptr;
            if (esp_http_client_get_header(client, "Location", &location) == ESP_OK && location != nullptr) {
                std::string next = location;
                const std::string base = BaseUrlFromApiUrl(current);
                next = JoinUrl(base, next);
                esp_http_client_close(client);
                esp_http_client_cleanup(client);
                if (!next.empty() && next != current) {
                    current = next;
                    if (out_final_url) {
                        *out_final_url = current;
                    }
                    continue;
                }
            }
            esp_http_client_close(client);
            esp_http_client_cleanup(client);
            return false;
        }

        if (status != 200) {
            esp_http_client_close(client);
            esp_http_client_cleanup(client);
            return false;
        }

        if (cl > 0 && static_cast<size_t>(cl) > max_bytes) {
            esp_http_client_close(client);
            esp_http_client_cleanup(client);
            return false;
        }

        out.reserve(cl > 0 ? static_cast<size_t>(cl) : 4096);

        uint8_t buf[1024];
        int empty_reads = 0;
        constexpr int kMaxEmptyReads = 200;
        while (true) {
            const int r = esp_http_client_read(client, reinterpret_cast<char*>(buf), sizeof(buf));
            if (r < 0) {
                esp_http_client_close(client);
                esp_http_client_cleanup(client);
                return false;
            }
            if (r == 0) {
                if (esp_http_client_is_complete_data_received(client)) {
                    break;
                }
                empty_reads++;
                if (empty_reads > kMaxEmptyReads) {
                    esp_http_client_close(client);
                    esp_http_client_cleanup(client);
                    return false;
                }
                vTaskDelay(pdMS_TO_TICKS(10));
                continue;
            }
            empty_reads = 0;
            if (out.size() + static_cast<size_t>(r) > max_bytes) {
                esp_http_client_close(client);
                esp_http_client_cleanup(client);
                return false;
            }
            out.insert(out.end(), buf, buf + r);
        }

        esp_http_client_close(client);
        esp_http_client_cleanup(client);
        return !out.empty();
    }

    return false;
}

bool HttpGetToBuffer(const std::string& url, std::vector<uint8_t>& out, size_t max_bytes) {
    return HttpGetToBufferEx(url, out, max_bytes, nullptr, nullptr, nullptr);
}

