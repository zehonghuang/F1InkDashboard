#include "backend_url.h"

#include "display/pages/f1_page_adapter_net.h"
#include "settings.h"

namespace {

inline constexpr const char* kDefaultF1ApiUrl = "http://192.168.31.110:8008/api/v1/ui/pages?tz=Asia/Shanghai";

std::string HttpBaseFromWsUrl(std::string ws_url) {
    ws_url = TrimUrl(std::move(ws_url));
    if (ws_url.empty()) {
        return {};
    }

    const bool is_wss = ws_url.rfind("wss://", 0) == 0;
    const bool is_ws = ws_url.rfind("ws://", 0) == 0;
    if (!is_ws && !is_wss) {
        return BaseUrlFromApiUrl(ws_url);
    }

    const size_t scheme = ws_url.find("://");
    const size_t host_start = scheme == std::string::npos ? 0 : (scheme + 3);
    const size_t slash = ws_url.find('/', host_start);
    const std::string host =
        (slash == std::string::npos) ? ws_url.substr(host_start) : ws_url.substr(host_start, slash - host_start);
    if (host.empty()) {
        return {};
    }
    return std::string(is_wss ? "https://" : "http://") + host;
}

}  // namespace

std::string GetBackendBaseUrl() {
    {
        Settings f1("f1", false);
        std::string api_url = TrimUrl(f1.GetString("api_url", ""));
        if (!api_url.empty()) {
            return BaseUrlFromApiUrl(api_url);
        }
    }

    {
        Settings ws("websocket", false);
        std::string ws_url = ws.GetString("url", "");
        std::string base = HttpBaseFromWsUrl(std::move(ws_url));
        base = TrimUrl(std::move(base));
        if (!base.empty()) {
            return base;
        }
    }

    return BaseUrlFromApiUrl(kDefaultF1ApiUrl);
}

std::string GetF1PagesApiUrl() {
    Settings f1("f1", false);
    std::string api_url = TrimUrl(f1.GetString("api_url", ""));
    if (!api_url.empty()) {
        if (api_url.find("/api/") == std::string::npos) {
            std::string base = TrimUrl(BaseUrlFromApiUrl(api_url));
            if (!base.empty()) {
                return JoinUrl(base, "/api/v1/ui/pages?tz=Asia/Shanghai");
            }
        }
        return api_url;
    }

    std::string base = GetBackendBaseUrl();
    if (base.empty()) {
        return TrimUrl(std::string(kDefaultF1ApiUrl));
    }
    return base + "/api/v1/ui/pages?tz=Asia/Shanghai";
}
