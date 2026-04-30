#include "ws_client_service.h"

#include "display/lcd_display.h"

#include <memory>
#include <string>
#include <vector>

#include <esp_log.h>

#include "settings.h"
#include "display/pages/f1_page_adapter_net.h"
#include "esp_network.h"
#include "web_socket.h"

namespace {

constexpr char kTag[] = "WsClientService";
constexpr EventBits_t kEvtDisconnected = BIT0;

struct OverlayArgs {
    LcdDisplay* display = nullptr;
    std::string* text = nullptr;
};

void ShowOverlayAsync(void* arg) {
    std::unique_ptr<OverlayArgs> args(static_cast<OverlayArgs*>(arg));
    if (!args || args->display == nullptr || args->text == nullptr) {
        return;
    }
    const std::string text = *args->text;
    delete args->text;
    args->display->ShowWsOverlay(text);
    args->display->RequestUrgentFullRefresh();
}

struct EpdArgs {
    LcdDisplay* display = nullptr;
    std::string* url = nullptr;
};

void ShowRawFrameTask(void* arg) {
    std::unique_ptr<EpdArgs> args(static_cast<EpdArgs*>(arg));
    if (!args || args->display == nullptr || args->url == nullptr) {
        vTaskDelete(nullptr);
        return;
    }
    const std::string url = *args->url;
    delete args->url;

    std::vector<uint8_t> buf;
    const int w = args->display->width();
    const int h = args->display->height();
    const size_t expected = static_cast<size_t>((w + 7) >> 3) * static_cast<size_t>(h);
    const size_t max_bytes = expected;
    if (!HttpGetToBuffer(url, buf, max_bytes)) {
        ESP_LOGW(kTag, "epd fetch failed url=%s", url.c_str());
        vTaskDelete(nullptr);
        return;
    }
    if (buf.size() != expected) {
        ESP_LOGW(kTag, "epd size mismatch url=%s got=%u exp=%u",
                 url.c_str(),
                 static_cast<unsigned>(buf.size()),
                 static_cast<unsigned>(expected));
        vTaskDelete(nullptr);
        return;
    }

    args->display->ShowRaw1bppFrame(buf.data(), buf.size());
    std::vector<uint8_t>().swap(buf);
    vTaskDelete(nullptr);
}

}  // namespace

WsClientService::WsClientService(LcdDisplay* display) : display_(display) {
    event_group_ = xEventGroupCreate();
}

WsClientService::~WsClientService() {
    Stop();
    if (event_group_ != nullptr) {
        vEventGroupDelete(event_group_);
        event_group_ = nullptr;
    }
}

bool WsClientService::IsRunning() const {
    return running_.load();
}

void WsClientService::Start(const std::string& url) {
    url_ = url;
    if (running_.load()) {
        return;
    }
    stop_.store(false);
    running_.store(true);
    xTaskCreate(&WsClientService::TaskEntry, "ws_client", 6144, this, 4, &task_);
}

void WsClientService::Stop() {
    if (!running_.load()) {
        return;
    }
    stop_.store(true);
    if (task_ != nullptr) {
        while (running_.load()) {
            vTaskDelay(pdMS_TO_TICKS(20));
        }
        task_ = nullptr;
    }
}

void WsClientService::TaskEntry(void* arg) {
    auto* self = static_cast<WsClientService*>(arg);
    if (self != nullptr) {
        self->TaskLoop();
    }
    vTaskDelete(nullptr);
}

void WsClientService::HandleIncomingText(const std::string& text) {
    ESP_LOGI(kTag, "rx len=%u", static_cast<unsigned>(text.size()));
    if (text.rfind("FULL:", 0) != 0) {
        if (text.rfind("EPD:", 0) == 0) {
            const std::string payload = TrimUrl(text.substr(4));
            if (!payload.empty()) {
                std::string url = payload;
                if (payload.rfind("http://", 0) != 0 && payload.rfind("https://", 0) != 0) {
                    Settings f1("f1", false);
                    std::string api_url =
                        TrimUrl(f1.GetString("api_url", "http://192.168.31.110:8008/api/v1/ui/pages?tz=Asia/Shanghai"));
                    const std::string base = BaseUrlFromApiUrl(api_url);
                    url = JoinUrl(base, payload);
                }
                auto* args = new EpdArgs();
                args->display = display_;
                args->url = new std::string(url);
                xTaskCreate(&ShowRawFrameTask, "epd_frame", 6144, args, 4, nullptr);
            }
        }
        return;
    }
    ESP_LOGI(kTag, "rx FULL");
    ShowOverlay(text.substr(5));
}

void WsClientService::ShowOverlay(const std::string& text) {
    if (display_ == nullptr) {
        ESP_LOGW(kTag, "overlay skip (no display)");
        return;
    }
    ESP_LOGI(kTag, "overlay show len=%u", static_cast<unsigned>(text.size()));
    auto* payload = new std::string(text);
    auto* args = new OverlayArgs();
    args->display = display_;
    args->text = payload;
    (void)lv_async_call(&ShowOverlayAsync, args);
}

void WsClientService::TaskLoop() {
    ESP_LOGI(kTag, "start");
    while (!stop_.load()) {
        if (url_.empty()) {
            Settings s("websocket", false);
            url_ = s.GetString("url", "");
            url_ = TrimUrl(url_);
            if (url_.empty()) {
                Settings f1("f1", false);
                std::string api_url =
                    TrimUrl(f1.GetString("api_url", "http://192.168.31.110:8008/api/v1/ui/pages?tz=Asia/Shanghai"));
                const std::string base = BaseUrlFromApiUrl(api_url);
                if (!base.empty()) {
                    const bool https = base.rfind("https://", 0) == 0;
                    const std::string ws_base = (https ? "wss://" : "ws://") + base.substr(https ? 8 : 7);
                    url_ = ws_base + "/ws";
                    ESP_LOGI(kTag, "url derived=%s", url_.c_str());
                } else {
                    ESP_LOGI(kTag, "url empty (waiting)");
                }
                vTaskDelay(pdMS_TO_TICKS(500));
                continue;
            }
            ESP_LOGI(kTag, "url loaded=%s", url_.c_str());
        }
        xEventGroupClearBits(event_group_, kEvtDisconnected);

        EspNetwork network;
        auto ws = network.CreateWebSocket(1);
        if (!ws) {
            vTaskDelay(pdMS_TO_TICKS(1000));
            continue;
        }

        ws->OnData([this](const char* data, size_t len, bool binary) {
            if (binary || data == nullptr || len == 0) {
                return;
            }
            this->HandleIncomingText(std::string(data, len));
        });
        ws->OnConnected([this]() {
            ESP_LOGI(kTag, "connected");
        });
        ws->OnDisconnected([this]() {
            ESP_LOGI(kTag, "disconnected");
            if (event_group_ != nullptr) {
                xEventGroupSetBits(event_group_, kEvtDisconnected);
            }
        });
        ws->OnError([this](int) {
            ESP_LOGI(kTag, "error");
            if (event_group_ != nullptr) {
                xEventGroupSetBits(event_group_, kEvtDisconnected);
            }
        });

        const std::string url = url_;
        ESP_LOGI(kTag, "connect url=%s", url.c_str());
        if (!ws->Connect(url.c_str())) {
            vTaskDelay(pdMS_TO_TICKS(2000));
            continue;
        }

        while (!stop_.load()) {
            const EventBits_t bits = xEventGroupWaitBits(
                event_group_, kEvtDisconnected, pdTRUE, pdFALSE, pdMS_TO_TICKS(500));
            if (bits & kEvtDisconnected) {
                break;
            }
        }

        ws->Close();
        vTaskDelay(pdMS_TO_TICKS(500));
    }
    running_.store(false);
    ESP_LOGI(kTag, "stop");
}
