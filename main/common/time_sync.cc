#include "time_sync.h"

#include "board.h"
#include "settings.h"

#include <esp_log.h>
#include <esp_timer.h>
#include <esp_err.h>

#include <sys/time.h>
#include <time.h>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include <esp_sntp.h>

#include "common/sleep_manager.h"

namespace {

constexpr char kTag[] = "TimeSync";

static bool IsValidEpoch(time_t t) {
    return t > 1700000000;
}

static void ApplyTimeZoneFromSettings() {
    Settings s("time", false);
    std::string tz = s.GetString("tz", "CST-8");
    setenv("TZ", tz.c_str(), 1);
    tzset();
}

struct State {
    TimeSyncState state = TimeSyncState::Idle;
    int64_t last_sync_ms = 0;
    int last_error = 0;
    bool task_running = false;
};

static State g;

static void SyncTask(void*) {
    g.state = TimeSyncState::Syncing;
    g.last_error = 0;
    sm_set_busy(SleepBusySrc::Net, true);

    ApplyTimeZoneFromSettings();

    esp_sntp_stop();
    esp_sntp_setoperatingmode(ESP_SNTP_OPMODE_POLL);

    Settings s("time", false);
    std::string s0 = s.GetString("sntp0", "pool.ntp.org");
    std::string s1 = s.GetString("sntp1", "time.nist.gov");
    if (!s0.empty()) {
        esp_sntp_setservername(0, s0.c_str());
    }
    if (!s1.empty()) {
        esp_sntp_setservername(1, s1.c_str());
    }

    esp_sntp_init();

    bool ok = false;
    for (int i = 0; i < 30; i++) {
        time_t now_s = 0;
        time(&now_s);
        if (IsValidEpoch(now_s)) {
            ok = true;
            break;
        }
        vTaskDelay(pdMS_TO_TICKS(500));
    }

    if (!ok) {
        g.state = TimeSyncState::Failed;
        g.last_error = static_cast<int>(ESP_ERR_TIMEOUT);
        esp_sntp_stop();
        sm_set_busy(SleepBusySrc::Net, false);
        g.task_running = false;
        vTaskDelete(nullptr);
        return;
    }

    time_t now_s = 0;
    time(&now_s);
    tm local_tm = {};
    if (localtime_r(&now_s, &local_tm) != nullptr) {
        (void)Board::GetInstance().SetLocalTime(local_tm);
    }

    g.state = TimeSyncState::Synced;
    g.last_sync_ms = esp_timer_get_time() / 1000;
    esp_sntp_stop();
    sm_set_busy(SleepBusySrc::Net, false);
    g.task_running = false;
    vTaskDelete(nullptr);
}

}  // namespace

TimeSyncService& TimeSyncService::Instance() {
    static TimeSyncService instance;
    return instance;
}

void TimeSyncService::RequestSync() {
    if (g.task_running) {
        return;
    }
    time_t now_s = 0;
    time(&now_s);
    if (IsValidEpoch(now_s)) {
        g.state = TimeSyncState::Synced;
        return;
    }
    g.task_running = true;
    if (xTaskCreate(SyncTask, "time_sync", 4096, nullptr, 3, nullptr) != pdPASS) {
        g.task_running = false;
        g.state = TimeSyncState::Failed;
        g.last_error = static_cast<int>(ESP_ERR_NO_MEM);
    }
}

TimeSyncSnapshot TimeSyncService::GetSnapshot() const {
    TimeSyncSnapshot s;
    s.state = g.state;
    s.last_sync_ms = g.last_sync_ms;
    s.last_error = g.last_error;
    return s;
}
