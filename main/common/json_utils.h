#ifndef JSON_UTILS_H
#define JSON_UTILS_H

#include <cJSON.h>

static inline const char* JsonGetStringOrEmpty(cJSON* obj, const char* key) {
    if (obj == nullptr || key == nullptr) {
        return "";
    }
    cJSON* it = cJSON_GetObjectItemCaseSensitive(obj, key);
    if (cJSON_IsString(it) && it->valuestring != nullptr) {
        return it->valuestring;
    }
    return "";
}

static inline cJSON* JsonGetObj(cJSON* obj, const char* key) {
    if (obj == nullptr || key == nullptr) {
        return nullptr;
    }
    cJSON* it = cJSON_GetObjectItemCaseSensitive(obj, key);
    return cJSON_IsObject(it) ? it : nullptr;
}

static inline cJSON* JsonGetArr(cJSON* obj, const char* key) {
    if (obj == nullptr || key == nullptr) {
        return nullptr;
    }
    cJSON* it = cJSON_GetObjectItemCaseSensitive(obj, key);
    return cJSON_IsArray(it) ? it : nullptr;
}

static inline bool JsonGetBoolTrue(cJSON* obj, const char* key) {
    if (obj == nullptr || key == nullptr) {
        return false;
    }
    cJSON* it = cJSON_GetObjectItemCaseSensitive(obj, key);
    return cJSON_IsBool(it) && cJSON_IsTrue(it);
}

#endif  // JSON_UTILS_H
