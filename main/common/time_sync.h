#ifndef TIME_SYNC_H
#define TIME_SYNC_H

#include <cstdint>

enum class TimeSyncState : uint8_t {
    Idle = 0,
    Syncing = 1,
    Synced = 2,
    Failed = 3,
};

struct TimeSyncSnapshot {
    TimeSyncState state = TimeSyncState::Idle;
    int64_t last_sync_ms = 0;
    int last_error = 0;
};

class TimeSyncService {
public:
    static TimeSyncService& Instance();

    void RequestSync();
    TimeSyncSnapshot GetSnapshot() const;

private:
    TimeSyncService() = default;
};

#endif
