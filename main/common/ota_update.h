#ifndef OTA_UPDATE_H_
#define OTA_UPDATE_H_

#include <cstdint>
#include <string>

#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"

enum class OtaState : uint8_t {
    Idle = 0,
    Checking = 1,
    UpdateAvailable = 2,
    Downloading = 3,
    Applying = 4,
    Succeeded = 5,
    Failed = 6,
};

struct OtaSnapshot {
    OtaState state = OtaState::Idle;
    int last_error = 0;
    int last_http_status = 0;
    std::string current_version;
    std::string target_version;
    std::string manifest_url;
    std::string bin_url;
    int progress_pct = -1;
    int64_t last_check_ms = 0;
    int64_t last_update_ms = 0;
};

class OtaUpdateService {
public:
    static OtaUpdateService& Instance();

    void NotifyNetworkConnected();
    void NotifyNetworkDisconnected();

    void RequestCheck(bool force = false);
    void RequestUpdateNow();

    OtaSnapshot GetSnapshot() const;

private:
    OtaUpdateService() = default;
    ~OtaUpdateService() = default;
    OtaUpdateService(const OtaUpdateService&) = delete;
    OtaUpdateService& operator=(const OtaUpdateService&) = delete;

    static void WorkerTask(void* arg);
    void WorkerLoop();

    bool ShouldAutoCheckLocked(int64_t now_ms) const;
    bool BuildManifestUrlLocked(std::string& out);
    bool CheckOnceLocked(int64_t now_ms, bool force);
    bool DownloadAndApplyLocked();

    void SetStateLocked(OtaState s);
    void FailLocked(int err, int http_status = 0);
    void SetProgressLocked(int pct);

    static int CompareVersion(const std::string& a, const std::string& b);
    static std::string GetCurrentVersion();

    mutable SemaphoreHandle_t mu_ = nullptr;
    void* task_ = nullptr;
    void* queue_ = nullptr;

    bool net_connected_ = false;
    bool check_requested_ = false;
    bool update_requested_ = false;
    bool force_check_requested_ = false;

    OtaSnapshot snap_{};
};

#endif  // OTA_UPDATE_H_
