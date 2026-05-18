#include "i18n.h"

#include "assets_fs.h"
#include "settings.h"

#include <cJSON.h>

#include <mutex>
#include <string>
#include <unordered_map>
#include <vector>

namespace {

constexpr const char* kDefaultLanguage = "zh-CN";
constexpr size_t kMaxLocaleFileBytes = 64 * 1024;

std::mutex g_mu;
std::string g_language;
std::unordered_map<std::string, std::string> g_strings;

std::string LoadLanguageSetting() {
    Settings s("i18n", false);
    const std::string lang = s.GetString("language", "");
    if (!lang.empty()) {
        return lang;
    }
    return kDefaultLanguage;
}

bool SaveLanguageSetting(const std::string& language) {
    Settings s("i18n", true);
    s.SetString("language", language);
    return true;
}

bool ParseLanguageJson(const std::vector<uint8_t>& bytes, std::unordered_map<std::string, std::string>& out) {
    if (bytes.empty()) {
        return false;
    }

    const std::string json_str(bytes.begin(), bytes.end());
    cJSON* root = cJSON_ParseWithLength(json_str.c_str(), json_str.size());
    if (root == nullptr) {
        return false;
    }

    cJSON* strings = cJSON_GetObjectItem(root, "strings");
    if (strings == nullptr || !cJSON_IsObject(strings)) {
        cJSON_Delete(root);
        return false;
    }

    for (cJSON* item = strings->child; item != nullptr; item = item->next) {
        if (item->string == nullptr) {
            continue;
        }
        if (!cJSON_IsString(item) || item->valuestring == nullptr) {
            continue;
        }
        out[item->string] = item->valuestring;
    }

    cJSON_Delete(root);
    return true;
}

bool LoadLocaleStrings(const std::string& language, std::unordered_map<std::string, std::string>& out) {
    std::vector<uint8_t> bytes;
    const std::string path = "locales/" + language + "/language.json";
    if (!ReadAssetsFile(path, bytes, kMaxLocaleFileBytes)) {
        return false;
    }
    return ParseLanguageJson(bytes, out);
}

}

bool I18n::Init() {
    std::lock_guard<std::mutex> lock(g_mu);
    g_language = LoadLanguageSetting();

    std::unordered_map<std::string, std::string> merged;
    (void)LoadLocaleStrings("en-US", merged);
    (void)LoadLocaleStrings(g_language, merged);

    g_strings = std::move(merged);
    return !g_strings.empty();
}

std::string I18n::GetLanguage() {
    std::lock_guard<std::mutex> lock(g_mu);
    if (g_language.empty()) {
        g_language = LoadLanguageSetting();
    }
    return g_language;
}

bool I18n::SetLanguage(const std::string& language) {
    {
        std::lock_guard<std::mutex> lock(g_mu);
        g_language = language.empty() ? kDefaultLanguage : language;
        (void)SaveLanguageSetting(g_language);
    }
    return Init();
}

const char* I18n::Tr(const char* key) {
    if (key == nullptr) {
        return "";
    }
    std::lock_guard<std::mutex> lock(g_mu);
    const auto it = g_strings.find(key);
    if (it == g_strings.end()) {
        return key;
    }
    return it->second.c_str();
}
