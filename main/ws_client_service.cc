#include "ws_client_service.h"

#include "backend_url.h"
#include "display/lcd_display.h"
#include "display/ui_page.h"
#include "display/pages/f1_page_adapter_net.h"
#include "application.h"

#include <memory>
#include <string>
#include <cstring>
#include <vector>

#include <cJSON.h>
#include <esp_log.h>
#include <mbedtls/base64.h>

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

struct MemeArgs {
    LcdDisplay* display = nullptr;
    std::string* title = nullptr;
    std::vector<uint8_t>* image = nullptr;
    std::vector<uint8_t>* audio = nullptr;
};

struct MemeRenderArgs {
    LcdDisplay* display = nullptr;
    std::string title;
    std::vector<uint8_t> image;
    std::string audio_url;
    std::string audio_mime;
};

struct MemeFetchArgs {
    LcdDisplay* display = nullptr;
    std::string title;
    std::string image_url;
    std::string audio_url;
    std::string audio_mime;
};

struct MemeAudioFetchArgs {
    std::string audio_url;
    std::string audio_mime;
};

struct AudioPlayArgs {
    std::vector<uint8_t>* audio = nullptr;
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

void ShowMemeAsync(void* arg) {
    std::unique_ptr<MemeArgs> args(static_cast<MemeArgs*>(arg));
    if (!args || args->display == nullptr || args->title == nullptr) {
        return;
    }
    std::string title = *args->title;
    delete args->title;
    std::vector<uint8_t> image;
    if (args->image != nullptr) {
        image = std::move(*args->image);
        delete args->image;
    }
    std::vector<uint8_t> audio;
    if (args->audio != nullptr) {
        audio = std::move(*args->audio);
        delete args->audio;
    }
    args->display->ShowMemeOverlay(title, std::move(image));
    if (!audio.empty()) {
        Application::GetInstance().GetAudioService().PlayWav(audio);
    }
    args->display->RequestUrgentFullRefresh();
}

void PlayAudioAsync(void* arg) {
    std::unique_ptr<AudioPlayArgs> args(static_cast<AudioPlayArgs*>(arg));
    if (!args || args->audio == nullptr) {
        return;
    }
    std::vector<uint8_t> audio = std::move(*args->audio);
    delete args->audio;
    if (!audio.empty()) {
        Application::GetInstance().GetAudioService().PlayWav(audio);
    }
}

bool DecodeBase64(const char* s, std::vector<uint8_t>& out, size_t max_bytes) {
    out.clear();
    if (s == nullptr) {
        return false;
    }
    const size_t in_len = strlen(s);
    if (in_len == 0) {
        return false;
    }
    size_t out_len = 0;
    if (mbedtls_base64_decode(nullptr, 0, &out_len, reinterpret_cast<const unsigned char*>(s), in_len) != 0) {
        return false;
    }
    if (out_len == 0 || out_len > max_bytes) {
        return false;
    }
    out.resize(out_len);
    size_t wrote = 0;
    if (mbedtls_base64_decode(out.data(), out.size(), &wrote, reinterpret_cast<const unsigned char*>(s), in_len) != 0) {
        out.clear();
        return false;
    }
    out.resize(wrote);
    return !out.empty();
}

std::string ResolveAssetUrl(std::string url) {
    url = TrimUrl(std::move(url));
    if (url.empty()) {
        return {};
    }
    if (url.rfind("http://", 0) == 0 || url.rfind("https://", 0) == 0) {
        return url;
    }
    std::string base = TrimUrl(GetBackendBaseUrl());
    if (base.empty()) {
        return {};
    }
    if (!url.empty() && url[0] != '/') {
        url = "/" + url;
    }
    return JoinUrl(base, url);
}

bool LooksLikeWav(const std::string& url, const std::string& mime) {
    if (mime.find("wav") != std::string::npos || mime.find("WAV") != std::string::npos) {
        return true;
    }
    const size_t q = url.find('?');
    const std::string no_query = (q == std::string::npos) ? url : url.substr(0, q);
    if (no_query.size() >= 4 && no_query.rfind(".wav") == no_query.size() - 4) {
        return true;
    }
    return false;
}

void MemeAudioFetchTask(void* arg) {
    std::unique_ptr<MemeAudioFetchArgs> args(static_cast<MemeAudioFetchArgs*>(arg));
    if (!args) {
        vTaskDelete(nullptr);
        return;
    }
    vTaskDelay(pdMS_TO_TICKS(200));
    std::vector<uint8_t> audio;
    const std::string full = ResolveAssetUrl(args->audio_url);
    if (!full.empty() && LooksLikeWav(full, args->audio_mime)) {
        (void)HttpGetToBuffer(full, audio, 300 * 1024);
    }
    if (!audio.empty()) {
        auto* play = new AudioPlayArgs();
        play->audio = new std::vector<uint8_t>(std::move(audio));
        (void)lv_async_call(&PlayAudioAsync, play);
    }
    vTaskDelete(nullptr);
}

void ShowMemeThenFetchAudioAsync(void* arg) {
    std::unique_ptr<MemeRenderArgs> args(static_cast<MemeRenderArgs*>(arg));
    if (!args || args->display == nullptr) {
        return;
    }
    args->display->ShowMemeOverlay(args->title, std::move(args->image));
    args->display->RequestUrgentFullRefresh();
    if (!args->audio_url.empty() && LooksLikeWav(args->audio_url, args->audio_mime)) {
        auto* fetch = new MemeAudioFetchArgs();
        fetch->audio_url = args->audio_url;
        fetch->audio_mime = args->audio_mime;
        xTaskCreate(&MemeAudioFetchTask, "meme_audio", 6144, fetch, 4, nullptr);
    }
}

void MemeFetchTask(void* arg) {
    std::unique_ptr<MemeFetchArgs> args(static_cast<MemeFetchArgs*>(arg));
    if (!args || args->display == nullptr) {
        vTaskDelete(nullptr);
        return;
    }
    std::vector<uint8_t> image;

    if (!args->image_url.empty()) {
        const std::string full = ResolveAssetUrl(args->image_url);
        if (!full.empty()) {
            (void)HttpGetToBuffer(full, image, 200 * 1024);
        }
    }
    auto* ui = new MemeRenderArgs();
    ui->display = args->display;
    ui->title = args->title;
    ui->image = std::move(image);
    ui->audio_url = args->audio_url;
    ui->audio_mime = args->audio_mime;
    (void)lv_async_call(&ShowMemeThenFetchAudioAsync, ui);
    vTaskDelete(nullptr);
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
        } else if (cJSON_IsString(topic) && topic->valuestring != nullptr &&
            std::string(topic->valuestring) == "v1/meme") {
            const cJSON* title = (payload != nullptr) ? cJSON_GetObjectItemCaseSensitive(payload, "title") : nullptr;
            if (!cJSON_IsString(title) || title->valuestring == nullptr) {
                cJSON_Delete(root);
                return;
            }

            std::vector<uint8_t> image;
            std::vector<uint8_t> audio;
            std::string image_url;
            std::string audio_url;
            std::string audio_mime;
            const cJSON* image_obj = (payload != nullptr) ? cJSON_GetObjectItemCaseSensitive(payload, "image") : nullptr;
            if (cJSON_IsObject(image_obj)) {
                const cJSON* url = cJSON_GetObjectItemCaseSensitive(image_obj, "url");
                if (cJSON_IsString(url) && url->valuestring != nullptr) {
                    image_url = url->valuestring;
                }
                const cJSON* enc = cJSON_GetObjectItemCaseSensitive(image_obj, "encoding");
                const cJSON* data = cJSON_GetObjectItemCaseSensitive(image_obj, "data");
                if (cJSON_IsString(enc) && enc->valuestring != nullptr &&
                    std::string(enc->valuestring) == "base64" &&
                    cJSON_IsString(data) && data->valuestring != nullptr) {
                    (void)DecodeBase64(data->valuestring, image, 200 * 1024);
                }
            }
            const cJSON* audio_obj = (payload != nullptr) ? cJSON_GetObjectItemCaseSensitive(payload, "audio") : nullptr;
            if (cJSON_IsObject(audio_obj)) {
                const cJSON* mime_json = cJSON_GetObjectItemCaseSensitive(audio_obj, "mime");
                if (cJSON_IsString(mime_json) && mime_json->valuestring != nullptr) {
                    audio_mime = mime_json->valuestring;
                }
                const cJSON* enc = cJSON_GetObjectItemCaseSensitive(audio_obj, "encoding");
                const cJSON* data = cJSON_GetObjectItemCaseSensitive(audio_obj, "data");
                const cJSON* url = cJSON_GetObjectItemCaseSensitive(audio_obj, "url");
                if (cJSON_IsString(url) && url->valuestring != nullptr) {
                    audio_url = url->valuestring;
                }
                if (audio.empty()) {
                    if (cJSON_IsString(enc) && enc->valuestring != nullptr &&
                        std::string(enc->valuestring) == "base64" &&
                        cJSON_IsString(data) && data->valuestring != nullptr) {
                        (void)DecodeBase64(data->valuestring, audio, 300 * 1024);
                    }
                }
            }

            if (display_ != nullptr) {
                {
                    auto* args = new MemeArgs();
                    args->display = display_;
                    args->title = new std::string(title->valuestring);
                    args->image = new std::vector<uint8_t>(std::move(image));
                    args->audio = new std::vector<uint8_t>(std::move(audio));
                    (void)lv_async_call(&ShowMemeAsync, args);
                }
                if (!image_url.empty() || (!audio_url.empty() && LooksLikeWav(audio_url, audio_mime))) {
                    auto* fetch = new MemeFetchArgs();
                    fetch->display = display_;
                    fetch->title = title->valuestring;
                    fetch->image_url = image_url;
                    fetch->audio_url = audio_url;
                    fetch->audio_mime = audio_mime;
                    xTaskCreate(&MemeFetchTask, "meme_fetch", 6144, fetch, 4, nullptr);
                }
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
        ws->OnConnected([]() {
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
