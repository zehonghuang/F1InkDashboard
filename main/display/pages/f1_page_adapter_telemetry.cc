#include "pages/f1_page_adapter.h"

#include <algorithm>
#include <cstdio>
#include <string>

bool F1PageAdapter::SelectTelemetryDriverFromResultLocked(bool from_quali) {
    const int row_focus = from_quali ? quali_result_row_focus_ : race_result_row_focus_;
    if (row_focus < 0) {
        return false;
    }

    int no = -1;
    std::string acr;
    if (from_quali) {
        const int n = static_cast<int>(quali_result_rows_.size());
        const int start = quali_result_page_ * kSessionsQualiRows;
        const int idx = start + row_focus;
        if (idx < 0 || idx >= n) {
            return false;
        }
        const auto& r = quali_result_rows_[static_cast<size_t>(idx)];
        try {
            no = std::stoi(r[1]);
        } catch (...) {
            no = -1;
        }
        acr = r[2];
    } else {
        const int n = static_cast<int>(race_result_rows_.size());
        const int start = race_result_page_ * kSessionsPracticeRows;
        const int idx = start + row_focus;
        if (idx < 0 || idx >= n) {
            return false;
        }
        const auto& r = race_result_rows_[static_cast<size_t>(idx)];
        try {
            no = std::stoi(r[1]);
        } catch (...) {
            no = -1;
        }
        acr = r[2];
    }

    if (no <= 0) {
        return false;
    }
    telemetry_driver_no_ = no;
    telemetry_driver_acr_ = std::move(acr);
    telemetry_speed_count_ = 0;
    telemetry_throttle_ = -1;
    telemetry_brake_ = -1;
    for (auto& v : telemetry_speed_) {
        v = 0;
    }
    return true;
}

void F1PageAdapter::ApplyTelemetryLocked() {
    if (race_sessions_header_left_ != nullptr) {
        char buf[128];
        const char* acr = telemetry_driver_acr_.empty() ? nullptr : telemetry_driver_acr_.c_str();
        if (acr != nullptr && acr[0]) {
            snprintf(buf, sizeof(buf), "[RESULTS] %s - SPEED TELEMETRY", acr);
        } else if (telemetry_driver_no_ > 0) {
            snprintf(buf, sizeof(buf), "[RESULTS] #%d - SPEED TELEMETRY", telemetry_driver_no_);
        } else {
            snprintf(buf, sizeof(buf), "[RESULTS] SPEED TELEMETRY");
        }
        SetText(race_sessions_header_left_, buf);
    }
    if (telemetry_graph_ != nullptr) {
        constexpr int cols = 32;
        std::string l0(cols, ' ');
        std::string l1(cols, ' ');
        std::string l2(cols, ' ');
        std::string l3(cols, ' ');

        const int start = std::max(0, telemetry_speed_count_ - cols);
        for (int i = start; i < telemetry_speed_count_; i++) {
            const int col = i - start;
            if (col < 0 || col >= cols) {
                continue;
            }
            const int v = static_cast<int>(telemetry_speed_[static_cast<size_t>(i)]);
            if (v <= 0) {
                continue;
            }
            int level = 3;
            if (v >= 340) {
                level = 0;
            } else if (v >= 280) {
                level = 1;
            } else if (v >= 200) {
                level = 2;
            } else {
                level = 3;
            }
            if (level == 0) {
                l0[static_cast<size_t>(col)] = '*';
            } else if (level == 1) {
                l1[static_cast<size_t>(col)] = '*';
            } else if (level == 2) {
                l2[static_cast<size_t>(col)] = '*';
            } else {
                l3[static_cast<size_t>(col)] = '*';
            }
        }

        std::string s;
        s.reserve(256);
        s += "340 | ";
        s += l0;
        s += "\n280 | ";
        s += l1;
        s += "\n200 | ";
        s += l2;
        s += "\n120 | ";
        s += l3;
        lv_label_set_text(telemetry_graph_, s.c_str());
    }
    if (telemetry_throttle_bar_ != nullptr) {
        lv_bar_set_value(telemetry_throttle_bar_, telemetry_throttle_ >= 0 ? telemetry_throttle_ : 0, LV_ANIM_OFF);
    }
    if (telemetry_throttle_value_ != nullptr) {
        if (telemetry_throttle_ >= 0) {
            SetTextFmt(telemetry_throttle_value_, "%d%%", telemetry_throttle_);
        } else {
            SetText(telemetry_throttle_value_, "--%");
        }
    }
    if (telemetry_brake_bar_ != nullptr) {
        lv_bar_set_value(telemetry_brake_bar_, telemetry_brake_ >= 0 ? telemetry_brake_ : 0, LV_ANIM_OFF);
    }
    if (telemetry_brake_value_ != nullptr) {
        if (telemetry_brake_ >= 0) {
            SetTextFmt(telemetry_brake_value_, "%d%%", telemetry_brake_);
        } else {
            SetText(telemetry_brake_value_, "--%");
        }
    }
    const bool has_any = telemetry_speed_count_ > 0 || telemetry_throttle_ >= 0 || telemetry_brake_ >= 0;
    if (telemetry_no_data_ != nullptr) {
        if (has_any) {
            lv_obj_add_flag(telemetry_no_data_, LV_OBJ_FLAG_HIDDEN);
        } else {
            lv_obj_clear_flag(telemetry_no_data_, LV_OBJ_FLAG_HIDDEN);
        }
    }
}

