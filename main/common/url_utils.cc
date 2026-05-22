#include "url_utils.h"

std::string TrimUrl(std::string s) {
    auto is_ws = [](unsigned char c) {
        return c == ' ' || c == '\t' || c == '\r' || c == '\n';
    };
    while (!s.empty() && is_ws(static_cast<unsigned char>(s.front()))) {
        s.erase(s.begin());
    }
    while (!s.empty() && is_ws(static_cast<unsigned char>(s.back()))) {
        s.pop_back();
    }
    auto is_quote = [](char c) {
        return c == '`' || c == '"' || c == '\'';
    };
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

std::string BaseUrlFromApiUrl(const std::string& api_url) {
    const std::string s = TrimUrl(api_url);
    const size_t scheme = s.find("://");
    if (scheme == std::string::npos) {
        return s;
    }
    const size_t host_start = scheme + 3;
    const size_t slash = s.find('/', host_start);
    if (slash == std::string::npos) {
        return s;
    }
    return s.substr(0, slash);
}

