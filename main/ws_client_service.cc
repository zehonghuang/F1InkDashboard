#include "ws_client_service.h"

#include "backend_url.h"
#include "display/lcd_display.h"
#include "display/ui_page.h"
#include "display/pages/f1_page_adapter_net.h"

#include <memory>
#include <string>

#include <cJSON.h>
#include <esp_log.h>

#include "settings.h"
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

}  // namespace

WsClientService::WsClientService(LcdDisplay* display, Mode mode) : display_(display), mode_(mode) {
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
    if (text.empty()) {
        return;
    }

    cJSON* root = cJSON_ParseWithLength(text.c_str(), text.size());
    if (root == nullptr) {
        return;
    }
    const cJSON* topic = cJSON_GetObjectItemCaseSensitive(root, "topic");
    const cJSON* payload = cJSON_GetObjectItemCaseSensitive(root, "payload");

    if (mode_ == Mode::News) {
        if (cJSON_IsString(topic) && topic->valuestring != nullptr &&
            std::string(topic->valuestring) == "v1/breaking") {
            const cJSON* title = (payload != nullptr) ? cJSON_GetObjectItemCaseSensitive(payload, "title") : nullptr;
            if (cJSON_IsString(title) && title->valuestring != nullptr) {
                ShowOverlay(title->valuestring);
            }
        }
        cJSON_Delete(root);
        return;
    }

    if (mode_ == Mode::OpenF1) {
        if (display_ != nullptr) {
            UiPageEvent e{};
            e.type = UiPageEventType::Custom;
            e.i32 = static_cast<int32_t>(UiPageCustomEventId::F1OpenF1WsEvent);
            e.ptr = new std::string(text);
            display_->DispatchPageEvent(e, false);
            display_->RequestDebouncedRefresh(150);
        }
    }

    cJSON_Delete(root);
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

std::string WsClientService::ResolveUrl() {
    std::string url = TrimUrl(url_);
    if (url.empty()) {
        Settings ws("websocket", false);
        url = TrimUrl(ws.GetString("url", ""));
    }

    if (url.empty()) {
        const std::string base = GetBackendBaseUrl();
        if (base.empty()) {
            return {};
        }
        const bool https = base.rfind("https://", 0) == 0;
        const std::string ws_base = (https ? "wss://" : "ws://") + base.substr(https ? 8 : 7);
        if (mode_ == Mode::News) {
            return ws_base + "/ws/news";
        }
        return ws_base + "/ws/openf1";
    }

    const std::string suffix = (mode_ == Mode::News) ? "/ws/news" : "/ws/openf1";
    const bool is_ws = url.rfind("ws://", 0) == 0 || url.rfind("wss://", 0) == 0;
    if (!is_ws) {
        const std::string base = TrimUrl(BaseUrlFromApiUrl(url));
        if (base.empty()) {
            return {};
        }
        const bool https = base.rfind("https://", 0) == 0;
        const std::string ws_base = (https ? "wss://" : "ws://") + base.substr(https ? 8 : 7);
        return ws_base + suffix;
    }

    const size_t q = url.find('?');
    const std::string no_query = (q == std::string::npos) ? url : url.substr(0, q);
    if (no_query.size() >= 3 && no_query.rfind("/ws", no_query.size() - 3) != std::string::npos) {
        return no_query.substr(0, no_query.size() - 3) + suffix;
    }
    return url;
}

void WsClientService::TaskLoop() {
    ESP_LOGI(kTag, "start");
    while (!stop_.load()) {
        const std::string url = ResolveUrl();
        if (url.empty()) {
            vTaskDelay(pdMS_TO_TICKS(500));
            continue;
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
