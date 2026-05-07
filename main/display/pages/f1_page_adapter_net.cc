#include "pages/f1_page_adapter_net.h"

#include <cstring>
#include <string>

#include "esp_http_client.h"
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

bool ParsePngSize(const uint8_t* data, size_t size, uint32_t& w, uint32_t& h) {
    static const uint8_t sig[8] = {0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a};
    if (size < 24) {
        return false;
    }
    if (memcmp(data, sig, sizeof(sig)) != 0) {
        return false;
    }
    w = (static_cast<uint32_t>(data[16]) << 24) | (static_cast<uint32_t>(data[17]) << 16) |
        (static_cast<uint32_t>(data[18]) << 8) | static_cast<uint32_t>(data[19]);
    h = (static_cast<uint32_t>(data[20]) << 24) | (static_cast<uint32_t>(data[21]) << 16) |
        (static_cast<uint32_t>(data[22]) << 8) | static_cast<uint32_t>(data[23]);
    return w > 0 && h > 0;
}

bool ParsePngIhdr(const uint8_t* data,
                  size_t size,
                  uint32_t& w,
                  uint32_t& h,
                  uint8_t& bit_depth,
                  uint8_t& color_type,
                  uint8_t& compression,
                  uint8_t& filter,
                  uint8_t& interlace) {
    static const uint8_t sig[8] = {0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a};
    if (data == nullptr || size < 33) {
        return false;
    }
    if (memcmp(data, sig, sizeof(sig)) != 0) {
        return false;
    }
    const uint32_t len = (static_cast<uint32_t>(data[8]) << 24) | (static_cast<uint32_t>(data[9]) << 16) |
                         (static_cast<uint32_t>(data[10]) << 8) | static_cast<uint32_t>(data[11]);
    if (len < 13) {
        return false;
    }
    if (memcmp(data + 12, "IHDR", 4) != 0) {
        return false;
    }
    w = (static_cast<uint32_t>(data[16]) << 24) | (static_cast<uint32_t>(data[17]) << 16) |
        (static_cast<uint32_t>(data[18]) << 8) | static_cast<uint32_t>(data[19]);
    h = (static_cast<uint32_t>(data[20]) << 24) | (static_cast<uint32_t>(data[21]) << 16) |
        (static_cast<uint32_t>(data[22]) << 8) | static_cast<uint32_t>(data[23]);
    bit_depth = data[24];
    color_type = data[25];
    compression = data[26];
    filter = data[27];
    interlace = data[28];
    return w > 0 && h > 0;
}

std::string BaseUrlFromApiUrl(const std::string& api_url) {
    const size_t scheme = api_url.find("://");
    if (scheme == std::string::npos) {
        return api_url;
    }
    const size_t host_start = scheme + 3;
    const size_t slash = api_url.find('/', host_start);
    if (slash == std::string::npos) {
        return api_url;
    }
    return api_url.substr(0, slash);
}

std::string JoinUrl(const std::string& base, const std::string& path) {
    if (path.rfind("http://", 0) == 0 || path.rfind("https://", 0) == 0) {
        return path;
    }
    if (base.empty()) {
        return path;
    }
    if (!path.empty() && path[0] == '/') {
        return base + path;
    }
    return base + "/" + path;
}

std::string TrimUrl(std::string s) {
    auto is_ws = [](unsigned char c) { return c == ' ' || c == '\t' || c == '\r' || c == '\n'; };
    while (!s.empty() && is_ws(static_cast<unsigned char>(s.front()))) {
        s.erase(s.begin());
    }
    while (!s.empty() && is_ws(static_cast<unsigned char>(s.back()))) {
        s.pop_back();
    }
    auto is_quote = [](char c) { return c == '`' || c == '"' || c == '\''; };
    while (s.size() >= 2 && is_quote(s.front()) && is_quote(s.back())) {
        if (s.front() == s.back()) {
            s = s.substr(1, s.size() - 2);
        } else {
            s.erase(s.begin());
            if (!s.empty()) {
                s.pop_back();
            }
        }
        while (!s.empty() && is_ws(static_cast<unsigned char>(s.front()))) {
            s.erase(s.begin());
        }
        while (!s.empty() && is_ws(static_cast<unsigned char>(s.back()))) {
            s.pop_back();
        }
    }
    while (!s.empty() && is_quote(s.front())) {
        s.erase(s.begin());
    }
    while (!s.empty() && is_quote(s.back())) {
        s.pop_back();
    }
    while (!s.empty() && is_ws(static_cast<unsigned char>(s.front()))) {
        s.erase(s.begin());
    }
    while (!s.empty() && is_ws(static_cast<unsigned char>(s.back()))) {
        s.pop_back();
    }
    return s;
}

uint32_t Fnv1a32(const char* s) {
    uint32_t h = 2166136261u;
    if (s == nullptr) {
        return h;
    }
    for (const unsigned char* p = reinterpret_cast<const unsigned char*>(s); *p; p++) {
        h ^= static_cast<uint32_t>(*p);
        h *= 16777619u;
    }
    return h;
}

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

        esp_http_client_handle_t client = esp_http_client_init(&config);
        if (client == nullptr) {
            return false;
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
