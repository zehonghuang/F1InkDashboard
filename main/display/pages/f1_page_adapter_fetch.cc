#include "pages/f1_page_adapter.h"

#include "backend_url.h"
#include "lcd_display.h"
#include "pages/f1_page_adapter_common.h"
#include "pages/f1_page_adapter_net.h"
#include "pages/f1_page_adapter_payloads.h"
#include "common/sleep_manager.h"

#include <algorithm>
#include <cctype>
#include <memory>
#include <string>
#include <vector>
#include <cstdio>

#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

using namespace f1_page_internal;

namespace {

struct FetchArg {
    F1PageAdapter* page = nullptr;
    LcdDisplay* host = nullptr;
    std::string url;
};

struct CircuitFetchArg {
    F1PageAdapter* page = nullptr;
    LcdDisplay* host = nullptr;
    std::string src_url;
    std::string url;
    int w = 0;
    int h = 0;
};

struct CircuitDetailFetchArg {
    F1PageAdapter* page = nullptr;
    LcdDisplay* host = nullptr;
    std::string src_url;
    std::string url;
    int w = 0;
    int h = 0;
};

struct SessionsFetchArg {
    F1PageAdapter* page = nullptr;
    LcdDisplay* host = nullptr;
    std::string url;
};

struct TelemetryAnalysisFetchArg {
    F1PageAdapter* page = nullptr;
    LcdDisplay* host = nullptr;
    std::string src_url;
    std::string url;
    int w = 0;
    int h = 0;
};

struct TelemetryMetaFetchArg {
    F1PageAdapter* page = nullptr;
    LcdDisplay* host = nullptr;
    std::string src_url;
    std::string url;
};

void FetchTask(void* arg) {
    std::unique_ptr<FetchArg> a(static_cast<FetchArg*>(arg));
    if (!a || a->page == nullptr || a->host == nullptr) {
        vTaskDelete(nullptr);
        return;
    }

    std::vector<uint8_t> bytes;
    if (HttpGetToBuffer(a->url, bytes, kMaxJsonBytes)) {
        UiPageEvent n{};
        n.type = UiPageEventType::Custom;
        n.i32 = static_cast<int32_t>(UiPageCustomEventId::ServiceReconnectHide);
        a->host->DispatchPageEvent(n, false);
        UiPageEvent e{};
        e.type = UiPageEventType::Custom;
        e.i32 = static_cast<int32_t>(UiPageCustomEventId::F1Data);
        auto* payload = new std::string(bytes.begin(), bytes.end());
        e.ptr = payload;
        a->host->DispatchPageEvent(e, false);
    } else {
        UiPageEvent r{};
        r.type = UiPageEventType::Custom;
        r.i32 = static_cast<int32_t>(UiPageCustomEventId::F1MainFetchFailed);
        a->host->DispatchPageEvent(r, false);
        UiPageEvent n{};
        n.type = UiPageEventType::Custom;
        n.i32 = static_cast<int32_t>(UiPageCustomEventId::ServiceReconnectShow);
        a->host->DispatchPageEvent(n, false);
        ESP_LOGW(kTag, "HTTP GET failed url=%s", a->url.c_str());
    }

    a->page->MarkFetchDone();
    vTaskDelete(nullptr);
}

void SessionsFetchTask(void* arg) {
    std::unique_ptr<SessionsFetchArg> a(static_cast<SessionsFetchArg*>(arg));
    if (!a || a->page == nullptr || a->host == nullptr) {
        vTaskDelete(nullptr);
        return;
    }

    std::vector<uint8_t> bytes;
    if (HttpGetToBuffer(a->url, bytes, kMaxJsonBytes)) {
        UiPageEvent n{};
        n.type = UiPageEventType::Custom;
        n.i32 = static_cast<int32_t>(UiPageCustomEventId::ServiceReconnectHide);
        a->host->DispatchPageEvent(n, false);
        a->page->MarkSessionsFetchDone();
        UiPageEvent e{};
        e.type = UiPageEventType::Custom;
        e.i32 = static_cast<int32_t>(UiPageCustomEventId::F1SessionsData);
        auto* payload = new std::string(bytes.begin(), bytes.end());
        e.ptr = payload;
        a->host->DispatchPageEvent(e, false);
    } else {
        UiPageEvent n{};
        n.type = UiPageEventType::Custom;
        n.i32 = static_cast<int32_t>(UiPageCustomEventId::ServiceReconnectShow);
        a->host->DispatchPageEvent(n, false);
        ESP_LOGW(kTag, "sessions fetch failed url=%s", a->url.c_str());
        a->page->MarkSessionsFetchDone();
    }
    vTaskDelete(nullptr);
}

void TelemetryAnalysisFetchTask(void* arg) {
    std::unique_ptr<TelemetryAnalysisFetchArg> a(static_cast<TelemetryAnalysisFetchArg*>(arg));
    if (!a || a->page == nullptr || a->host == nullptr) {
        vTaskDelete(nullptr);
        return;
    }

    std::vector<uint8_t> bytes;
    const size_t expected = static_cast<size_t>((a->w + 7) >> 3) * static_cast<size_t>(a->h);
    bool ok = HttpGetToBuffer(a->url, bytes, expected);
    const unsigned bytes_n = static_cast<unsigned>(bytes.size());
    ESP_LOGI(kTag, "telemetry chart frame fetched ok=%d bytes=%u url=%s", ok ? 1 : 0, bytes_n, a->url.c_str());
    {
        UiPageEvent e{};
        e.type = UiPageEventType::Custom;
        e.i32 = static_cast<int32_t>(UiPageCustomEventId::F1TelemetryAnalysisData);
        auto* payload = new f1_page_internal::TelemetryChartPayload();
        payload->url = a->src_url;
        payload->w = a->w;
        payload->h = a->h;
        payload->status = ok ? 200 : 0;
        payload->bytes = std::move(bytes);
        e.ptr = payload;
        a->host->DispatchPageEvent(e, false);
    }

    a->page->MarkTelemetryAnalysisFetchDone();
    vTaskDelete(nullptr);
}

void TelemetryMetaFetchTask(void* arg) {
    std::unique_ptr<TelemetryMetaFetchArg> a(static_cast<TelemetryMetaFetchArg*>(arg));
    if (!a || a->page == nullptr || a->host == nullptr) {
        vTaskDelete(nullptr);
        return;
    }

    std::vector<uint8_t> bytes;
    const bool ok = HttpGetToBuffer(a->url, bytes, 8 * 1024);
    UiPageEvent n{};
    n.type = UiPageEventType::Custom;
    n.i32 = static_cast<int32_t>(ok ? UiPageCustomEventId::ServiceReconnectHide : UiPageCustomEventId::ServiceReconnectShow);
    a->host->DispatchPageEvent(n, false);
    UiPageEvent e{};
    e.type = UiPageEventType::Custom;
    e.i32 = static_cast<int32_t>(UiPageCustomEventId::F1TelemetryMetaData);
    auto* payload = new f1_page_internal::TelemetryMetaPayload();
    payload->url = a->src_url;
    payload->status = ok ? 200 : 0;
    payload->json = std::string(bytes.begin(), bytes.end());
    e.ptr = payload;
    a->host->DispatchPageEvent(e, false);

    a->page->MarkTelemetryMetaFetchDone();
    vTaskDelete(nullptr);
}

void CircuitFetchTask(void* arg) {
    std::unique_ptr<CircuitFetchArg> a(static_cast<CircuitFetchArg*>(arg));
    if (!a || a->page == nullptr || a->host == nullptr) {
        vTaskDelete(nullptr);
        return;
    }

    std::vector<uint8_t> bytes;
    const size_t expected = static_cast<size_t>((a->w + 7) >> 3) * static_cast<size_t>(a->h);
    const bool ok = HttpGetToBuffer(a->url, bytes, expected);
    const unsigned bytes_n = static_cast<unsigned>(bytes.size());
    ESP_LOGI(kTag, "circuit frame fetched ok=%d bytes=%u url=%s",
             ok ? 1 : 0,
             bytes_n,
             a->url.c_str());
    UiPageEvent e{};
    e.type = UiPageEventType::Custom;
    e.i32 = static_cast<int32_t>(UiPageCustomEventId::F1CircuitImage);
    auto* payload = new f1_page_internal::CircuitImagePayload();
    payload->url = a->src_url;
    payload->final_url = a->url;
    payload->status = ok ? 200 : 0;
    payload->bytes = std::move(bytes);
    e.ptr = payload;
    a->host->DispatchPageEvent(e, false);
    if (!ok) {
        ESP_LOGW(kTag, "circuit frame fetch failed url=%s",
                 a->url.c_str());
    }

    a->page->MarkCircuitFetchDone();
    vTaskDelete(nullptr);
}

void CircuitDetailFetchTask(void* arg) {
    std::unique_ptr<CircuitDetailFetchArg> a(static_cast<CircuitDetailFetchArg*>(arg));
    if (!a || a->page == nullptr || a->host == nullptr) {
        vTaskDelete(nullptr);
        return;
    }

    std::vector<uint8_t> bytes;
    const size_t expected = static_cast<size_t>((a->w + 7) >> 3) * static_cast<size_t>(a->h);
    const bool ok = HttpGetToBuffer(a->url, bytes, expected);
    const unsigned bytes_n = static_cast<unsigned>(bytes.size());
    ESP_LOGI(kTag, "circuit detail frame fetched ok=%d bytes=%u url=%s",
             ok ? 1 : 0,
             bytes_n,
             a->url.c_str());
    UiPageEvent e{};
    e.type = UiPageEventType::Custom;
    e.i32 = static_cast<int32_t>(UiPageCustomEventId::F1CircuitDetailImage);
    auto* payload = new f1_page_internal::CircuitDetailImagePayload();
    payload->url = a->src_url;
    payload->final_url = a->url;
    payload->status = ok ? 200 : 0;
    payload->bytes = std::move(bytes);
    e.ptr = payload;
    a->host->DispatchPageEvent(e, false);
    if (!ok) {
        ESP_LOGW(kTag, "circuit detail frame fetch failed url=%s",
                 a->url.c_str());
    }

    a->page->MarkCircuitDetailFetchDone();
    vTaskDelete(nullptr);
}

}  // namespace

void F1PageAdapter::MarkFetchDone() {
    fetch_inflight_.store(false);
    const bool busy =
        fetch_inflight_.load() ||
        sessions_fetch_inflight_.load() ||
        circuit_fetch_inflight_.load() ||
        circuit_detail_fetch_inflight_.load() ||
        telemetry_analysis_fetch_inflight_.load() ||
        telemetry_meta_fetch_inflight_.load();
    sm_set_busy(SleepBusySrc::Net, busy);
}

void F1PageAdapter::MarkCircuitFetchDone() {
    circuit_fetch_inflight_.store(false);
    const bool busy =
        fetch_inflight_.load() ||
        sessions_fetch_inflight_.load() ||
        circuit_fetch_inflight_.load() ||
        circuit_detail_fetch_inflight_.load() ||
        telemetry_analysis_fetch_inflight_.load() ||
        telemetry_meta_fetch_inflight_.load();
    sm_set_busy(SleepBusySrc::Net, busy);
}

void F1PageAdapter::MarkCircuitDetailFetchDone() {
    circuit_detail_fetch_inflight_.store(false);
    const bool busy =
        fetch_inflight_.load() ||
        sessions_fetch_inflight_.load() ||
        circuit_fetch_inflight_.load() ||
        circuit_detail_fetch_inflight_.load() ||
        telemetry_analysis_fetch_inflight_.load() ||
        telemetry_meta_fetch_inflight_.load();
    sm_set_busy(SleepBusySrc::Net, busy);
}

void F1PageAdapter::MarkSessionsFetchDone() {
    sessions_fetch_inflight_.store(false);
    const bool busy =
        fetch_inflight_.load() ||
        sessions_fetch_inflight_.load() ||
        circuit_fetch_inflight_.load() ||
        circuit_detail_fetch_inflight_.load() ||
        telemetry_analysis_fetch_inflight_.load() ||
        telemetry_meta_fetch_inflight_.load();
    sm_set_busy(SleepBusySrc::Net, busy);
}

void F1PageAdapter::MarkTelemetryAnalysisFetchDone() {
    telemetry_analysis_fetch_inflight_.store(false);
    const bool busy =
        fetch_inflight_.load() ||
        sessions_fetch_inflight_.load() ||
        circuit_fetch_inflight_.load() ||
        circuit_detail_fetch_inflight_.load() ||
        telemetry_analysis_fetch_inflight_.load() ||
        telemetry_meta_fetch_inflight_.load();
    sm_set_busy(SleepBusySrc::Net, busy);
}

void F1PageAdapter::MarkTelemetryMetaFetchDone() {
    telemetry_meta_fetch_inflight_.store(false);
    const bool busy =
        fetch_inflight_.load() ||
        sessions_fetch_inflight_.load() ||
        circuit_fetch_inflight_.load() ||
        circuit_detail_fetch_inflight_.load() ||
        telemetry_analysis_fetch_inflight_.load() ||
        telemetry_meta_fetch_inflight_.load();
    sm_set_busy(SleepBusySrc::Net, busy);
}

int64_t F1PageAdapter::FetchRetryDelayMsLocked() const {
    if (fetch_fail_count_ <= 0) {
        return 0;
    }
    int c = fetch_fail_count_;
    if (c > 8) {
        c = 8;
    }
    int64_t d = 2000LL;
    d = d << (c - 1);
    if (d > 60LL * 1000) {
        d = 60LL * 1000;
    }
    return d;
}

void F1PageAdapter::StartFetchIfNeededLocked(bool force) {
    if (fetch_inflight_.load()) {
        return;
    }
    const int64_t now = NowMs();
    const int64_t retry_delay = FetchRetryDelayMsLocked();
    if (retry_delay > 0 && last_attempt_ms_ > 0 && now - last_attempt_ms_ < retry_delay) {
        return;
    }
    if (!force) {
        if (last_fetch_ms_ > 0 && now - last_fetch_ms_ < refresh_interval_ms_) {
            return;
        }
        if (fetch_fail_count_ == 0 && last_fetch_ms_ == 0 && last_attempt_ms_ > 0 && now - last_attempt_ms_ < 30 * 1000) {
            return;
        }
    }

    std::string url = GetF1PagesApiUrl();
    url = TrimUrl(url);
    if (url.empty()) {
        return;
    }
    api_url_ = url;

    ESP_LOGI(kTag, "fetch start force=%d race_week=%d interval_ms=%lld url=%s",
             force ? 1 : 0,
             is_race_week_ ? 1 : 0,
             static_cast<long long>(refresh_interval_ms_),
             url.c_str());
    last_attempt_ms_ = now;
    auto* arg = new FetchArg();
    arg->page = this;
    arg->host = host_;
    arg->url = url;
    const BaseType_t ok = xTaskCreate(&FetchTask, "f1_api", 8192, arg, 4, nullptr);
    if (ok != pdPASS) {
        ESP_LOGW(kTag, "fetch task create failed");
        delete arg;
        fetch_inflight_.store(false);
        return;
    }
    fetch_inflight_.store(true);
    sm_set_busy(SleepBusySrc::Net, true);
}

void F1PageAdapter::StartSessionsFetchIfNeededLocked(bool force) {
    if (sessions_fetch_inflight_.load()) {
        return;
    }
    const int64_t now = NowMs();
    if (!force) {
        if (last_sessions_fetch_ms_ > 0 && now - last_sessions_fetch_ms_ < 15 * 1000) {
            return;
        }
    }

    std::string base = BaseUrlFromApiUrl(api_url_);
    if (base.empty()) {
        base = GetBackendBaseUrl();
    }
    if (base.empty()) {
        return;
    }

    const auto p = static_cast<RaceSessionsSubPage>(static_cast<uint8_t>(race_sessions_page_));
    std::string path = "/api/v1/f1/sessions/current?tz=Asia/Shanghai&limit=30";
    if (p == RaceSessionsSubPage::QualiResult) {
        path = "/api/v1/f1/sessions?tz=Asia/Shanghai&session=qualifying&q=3&limit=30";
    } else if (p == RaceSessionsSubPage::RaceResult) {
        path = "/api/v1/f1/sessions?tz=Asia/Shanghai&session=race&limit=30";
    }

    std::string url = JoinUrl(base, path);
    url = TrimUrl(url);
    if (url.empty()) {
        return;
    }
    sessions_url_ = url;

    auto* arg = new SessionsFetchArg();
    arg->page = this;
    arg->host = host_;
    arg->url = url;
    const BaseType_t ok = xTaskCreate(&SessionsFetchTask, "f1_sessions", 8192, arg, 4, nullptr);
    if (ok != pdPASS) {
        ESP_LOGW(kTag, "sessions task create failed");
        delete arg;
        sessions_fetch_inflight_.store(false);
        return;
    }
    sessions_fetch_inflight_.store(true);
    sm_set_busy(SleepBusySrc::Net, true);
    last_sessions_fetch_ms_ = now;
}

void F1PageAdapter::StartTelemetryAnalysisFetchLocked(bool force) {
    if (telemetry_analysis_fetch_inflight_.load()) {
        return;
    }
    if (telemetry_driver_no_ <= 0) {
        return;
    }
    const int64_t now = NowMs();
    if (!force) {
        if (last_telemetry_analysis_fetch_ms_ > 0 && now - last_telemetry_analysis_fetch_ms_ < 3 * 1000) {
            return;
        }
    }

    std::string base = BaseUrlFromApiUrl(api_url_);
    if (base.empty()) {
        base = GetBackendBaseUrl();
    }
    base = TrimUrl(base);
    if (base.empty()) {
        return;
    }
    std::string png_url = "";
    std::string meta_url = "";

    auto upper = race_sessions_header_left_text_;
    std::transform(upper.begin(), upper.end(), upper.begin(), [](unsigned char c) { return static_cast<char>(std::toupper(c)); });
    const bool is_miami = (upper.find("MIAMI") != std::string::npos);
    const auto prev = static_cast<RaceSessionsSubPage>(static_cast<uint8_t>(telemetry_prev_page_));
    if (is_miami && prev == RaceSessionsSubPage::QualiResult) {
        char buf[256];
        snprintf(buf, sizeof(buf), "%s/static/assets/miami/miami_quali_driver_%d_best.png", base.c_str(), telemetry_driver_no_);
        png_url = buf;
        snprintf(buf, sizeof(buf), "%s/static/assets/miami/miami_quali_driver_%d_best.json", base.c_str(), telemetry_driver_no_);
        meta_url = buf;
    } else if (is_miami && prev == RaceSessionsSubPage::RaceResult) {
        char buf[256];
        snprintf(buf, sizeof(buf), "%s/static/assets/miami/miami_race_driver_%d_best.png", base.c_str(), telemetry_driver_no_);
        png_url = buf;
        snprintf(buf, sizeof(buf), "%s/static/assets/miami/miami_race_driver_%d_best.json", base.c_str(), telemetry_driver_no_);
        meta_url = buf;
    } else {
        char buf[256];
        snprintf(buf, sizeof(buf), "%s/api/v1/charts/driver/%d/latest.png", base.c_str(), telemetry_driver_no_);
        png_url = buf;
        snprintf(buf, sizeof(buf), "%s/api/v1/charts/driver/%d/latest.json", base.c_str(), telemetry_driver_no_);
        meta_url = buf;
    }
    telemetry_meta_url_ = meta_url;

    int w = 0;
    int h = 0;
    lv_obj_t* box = nullptr;
    if (telemetry_graph_ != nullptr) {
        box = lv_obj_get_parent(telemetry_graph_);
    }
    if (box != nullptr) {
        constexpr int kInset = 0;
        lv_area_t a{};
        lv_obj_get_coords(box, &a);
        w = (a.x2 - a.x1 + 1) - kInset * 2;
        h = (a.y2 - a.y1 + 1) - kInset * 2;
    }
    if (w <= 0) {
        w = 1;
    }
    if (h <= 0) {
        h = 1;
    }
    if (w > 1200) {
        w = 1200;
    }
    if (h > 1200) {
        h = 1200;
    }

    char frame_url[512];
    snprintf(frame_url,
             sizeof(frame_url),
             "%s/api/v1/epd/frame.bin?png_url=%s&w=%d&h=%d&dither=1",
             base.c_str(),
             png_url.c_str(),
             w,
             h);

    auto* arg = new TelemetryAnalysisFetchArg();
    arg->page = this;
    arg->host = host_;
    arg->src_url = png_url;
    arg->url = frame_url;
    arg->w = w;
    arg->h = h;
    const BaseType_t ok = xTaskCreate(&TelemetryAnalysisFetchTask, "f1_tlm", 8192, arg, 4, nullptr);
    if (ok != pdPASS) {
        delete arg;
        telemetry_analysis_fetch_inflight_.store(false);
        return;
    }
    telemetry_analysis_fetch_inflight_.store(true);
    sm_set_busy(SleepBusySrc::Net, true);
    last_telemetry_analysis_fetch_ms_ = now;

    if (!telemetry_meta_fetch_inflight_.load()) {
        auto* arg2 = new TelemetryMetaFetchArg();
        arg2->page = this;
        arg2->host = host_;
        arg2->src_url = meta_url;
        arg2->url = meta_url;
        const BaseType_t ok2 = xTaskCreate(&TelemetryMetaFetchTask, "f1_tlm_m", 8192, arg2, 4, nullptr);
        if (ok2 != pdPASS) {
            delete arg2;
        } else {
            telemetry_meta_fetch_inflight_.store(true);
            sm_set_busy(SleepBusySrc::Net, true);
        }
    }
}

void F1PageAdapter::StartCircuitFetchIfNeededLocked(const char* map_url) {
    if (map_url == nullptr || map_url[0] == 0) {
        ESP_LOGW(kTag, "circuit image url empty");
        circuit_image_url_.clear();
        circuit_image_bytes_.clear();
        if (race_track_image_ != nullptr) {
            lv_obj_add_flag(race_track_image_, LV_OBJ_FLAG_HIDDEN);
        }
        if (race_track_placeholder_ != nullptr) {
            lv_obj_clear_flag(race_track_placeholder_, LV_OBJ_FLAG_HIDDEN);
        }
        return;
    }
    if (circuit_fetch_inflight_.load()) {
        ESP_LOGI(kTag, "circuit image fetch inflight");
        return;
    }
    std::string path = TrimUrl(map_url);
    std::string base = BaseUrlFromApiUrl(api_url_);
    if (base.empty()) {
        base = GetBackendBaseUrl();
    }
    const std::string full = JoinUrl(base, path);
    if (full.empty()) {
        return;
    }
    if (full == circuit_image_url_ && !circuit_image_bytes_.empty()) {
        ESP_LOGI(kTag, "circuit image url unchanged full=%s", full.c_str());
        return;
    }
    circuit_image_url_ = full;
    int w = 0;
    int h = 0;
    if (race_track_box_ != nullptr) {
        constexpr int kInset = 2;
        w = static_cast<int>(lv_obj_get_width(race_track_box_)) - kInset * 2;
        h = static_cast<int>(lv_obj_get_height(race_track_box_)) - kInset * 2;
    }
    if (w <= 0) {
        w = 1;
    }
    if (h <= 0) {
        h = 1;
    }
    char frame_url[512];
    snprintf(frame_url,
             sizeof(frame_url),
             "%s/api/v1/epd/frame.bin?png_url=%s&w=%d&h=%d&dither=1",
             base.c_str(),
             full.c_str(),
             w,
             h);
    ESP_LOGI(kTag, "circuit frame fetch start url=%s", frame_url);
    auto* arg = new CircuitFetchArg();
    arg->page = this;
    arg->host = host_;
    arg->src_url = full;
    arg->url = frame_url;
    arg->w = w;
    arg->h = h;
    const BaseType_t ok = xTaskCreate(&CircuitFetchTask, "f1_circuit", 8192, arg, 4, nullptr);
    if (ok != pdPASS) {
        ESP_LOGW(kTag, "circuit frame task create failed");
        delete arg;
        circuit_fetch_inflight_.store(false);
        return;
    }
    circuit_fetch_inflight_.store(true);
    sm_set_busy(SleepBusySrc::Net, true);
}

void F1PageAdapter::StartCircuitDetailFetchIfNeededLocked(const char* map_url) {
    if (map_url == nullptr || map_url[0] == 0) {
        ESP_LOGW(kTag, "circuit detail image url empty");
        circuit_detail_image_url_.clear();
        circuit_detail_image_bytes_.clear();
        if (circuit_map_image_ != nullptr) {
            lv_obj_add_flag(circuit_map_image_, LV_OBJ_FLAG_HIDDEN);
        }
        if (circuit_map_placeholder_ != nullptr) {
            lv_obj_clear_flag(circuit_map_placeholder_, LV_OBJ_FLAG_HIDDEN);
        }
        return;
    }
    if (circuit_detail_fetch_inflight_.load()) {
        ESP_LOGI(kTag, "circuit detail image fetch inflight");
        return;
    }
    std::string path = TrimUrl(map_url);
    std::string base = BaseUrlFromApiUrl(api_url_);
    if (base.empty()) {
        base = GetBackendBaseUrl();
    }
    const std::string full = JoinUrl(base, path);
    if (full.empty()) {
        return;
    }
    if (full == circuit_detail_image_url_ && !circuit_detail_image_bytes_.empty()) {
        ESP_LOGI(kTag, "circuit detail image url unchanged full=%s", full.c_str());
        return;
    }
    circuit_detail_image_url_ = full;
    int w = 0;
    int h = 0;
    if (circuit_map_root_ != nullptr) {
        constexpr int kInset = 2;
        w = (static_cast<int>(lv_obj_get_width(circuit_map_root_)) - 8) - kInset * 2;
        h = (static_cast<int>(lv_obj_get_height(circuit_map_root_)) - 8) - kInset * 2;
    }
    if (w <= 0) {
        w = 1;
    }
    if (h <= 0) {
        h = 1;
    }
    if (w > 1200) {
        w = 1200;
    }
    if (h > 1200) {
        h = 1200;
    }
    char frame_url[512];
    snprintf(frame_url,
             sizeof(frame_url),
             "%s/api/v1/epd/frame.bin?png_url=%s&w=%d&h=%d&dither=1",
             base.c_str(),
             full.c_str(),
             w,
             h);
    ESP_LOGI(kTag, "circuit detail frame fetch start url=%s", frame_url);
    auto* arg = new CircuitDetailFetchArg();
    arg->page = this;
    arg->host = host_;
    arg->src_url = full;
    arg->url = frame_url;
    arg->w = w;
    arg->h = h;
    const BaseType_t ok = xTaskCreate(&CircuitDetailFetchTask, "f1_circuit_d", 8192, arg, 4, nullptr);
    if (ok != pdPASS) {
        ESP_LOGW(kTag, "circuit detail frame task create failed");
        delete arg;
        circuit_detail_fetch_inflight_.store(false);
        return;
    }
    circuit_detail_fetch_inflight_.store(true);
    sm_set_busy(SleepBusySrc::Net, true);
}
