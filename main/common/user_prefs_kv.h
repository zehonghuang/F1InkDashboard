#ifndef USER_PREFS_KV_H
#define USER_PREFS_KV_H

#include <cstdint>
#include <string>
#include <vector>

#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/semphr.h"

struct UserPrefsKV {
    std::string nick;
    std::string avatar;
    std::string team;
    std::vector<std::string> teams;
    std::vector<int> drivers;
};

struct UserPrefsKVSnapshot {
    bool bound = false;
    int64_t last_fetch_ms = 0;
    int last_status = 0;
    UserPrefsKV kv;
};

class UserPrefsKVService {
public:
    static UserPrefsKVService& Instance();

    void RequestFetch(bool force);
    UserPrefsKVSnapshot GetSnapshot();

private:
    UserPrefsKVService() = default;
    ~UserPrefsKVService() = default;
    UserPrefsKVService(const UserPrefsKVService&) = delete;
    UserPrefsKVService& operator=(const UserPrefsKVService&) = delete;

    static void WorkerTask(void* arg);
    void WorkerLoop();
    void LoadFromSettingsLocked();
    void SaveToSettingsLocked();
    void ClearSettingsLocked();

    void* task_ = nullptr;
    QueueHandle_t queue_ = nullptr;
    SemaphoreHandle_t mu_ = nullptr;

    bool loaded_ = false;
    bool inflight_ = false;

    int64_t next_regular_fetch_ms_ = 0;
    int64_t next_try_ms_ = 0;
    int backoff_ms_ = 5000;

    UserPrefsKVSnapshot snapshot_{};
};

#endif  // USER_PREFS_KV_H

