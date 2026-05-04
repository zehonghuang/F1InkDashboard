#include "pages/f1_page_adapter.h"

#include "lcd_display.h"
#include "pages/f1_page_adapter_common.h"

#include <algorithm>
#include <cstdio>
#include <string>

namespace {

static std::string FmtClock(double seconds) {
    if (!(seconds > 0.0)) {
        return "--";
    }
    int m = static_cast<int>(seconds / 60.0);
    double s = seconds - static_cast<double>(m) * 60.0;
    if (m < 0) {
        m = 0;
    }
    if (s < 0.0) {
        s = 0.0;
    }
    char buf[24];
    snprintf(buf, sizeof(buf), "%d:%05.2f", m, s);
    return buf;
}

}  // namespace

bool F1PageAdapter::SelectTelemetryDriverFromResultLocked(bool from_quali) {
    const int row_focus = from_quali ? quali_result_row_focus_ : race_result_row_focus_;
    if (row_focus < 0) {
        return false;
    }

    int no = -1;
    int pos = -1;
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
        try {
            pos = std::stoi(r[0]);
        } catch (...) {
            pos = -1;
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
        try {
            pos = std::stoi(r[0]);
        } catch (...) {
            pos = -1;
        }
        acr = r[2];
    }

    if (no <= 0) {
        return false;
    }
    telemetry_driver_no_ = no;
    telemetry_driver_acr_ = std::move(acr);
    telemetry_driver_pos_ = pos;
    telemetry_speed_count_ = 0;
    telemetry_throttle_ = -1;
    telemetry_brake_ = -1;
    for (auto& v : telemetry_speed_) {
        v = 0;
    }

    telemetry_analysis_loading_ = true;
    telemetry_chart_url_.clear();
    telemetry_chart_bytes_.clear();
    return true;
}

void F1PageAdapter::ApplyTelemetryLocked() {
    if (telemetry_title_ != nullptr) {
        SetText(telemetry_title_, "");
    }

    if (race_sessions_header_left_ != nullptr) {
        std::string gp = race_sessions_header_left_text_;
        const size_t pos = gp.find("] ");
        if (pos != std::string::npos) {
            gp = gp.substr(pos + 2);
        }
        if (gp.empty()) {
            gp = "GP";
        }
        char buf[96];
        snprintf(buf, sizeof(buf), "[ANALYSIS] %s", gp.c_str());
        SetText(race_sessions_header_left_, buf);
    }

    if (race_sessions_header_center_ != nullptr) {
        const char* acr = telemetry_driver_acr_.empty() ? nullptr : telemetry_driver_acr_.c_str();
        const int pos = telemetry_driver_pos_;
        char buf[96];
        const int ln = telemetry_meta_lap_number_;
        if (acr != nullptr && acr[0] && pos > 0 && ln > 0) {
            snprintf(buf, sizeof(buf), "%s #%02d (LAP %d-FL)", acr, pos, ln);
        } else if (acr != nullptr && acr[0] && ln > 0) {
            snprintf(buf, sizeof(buf), "%s (LAP %d-FL)", acr, ln);
        } else if (telemetry_driver_no_ > 0 && ln > 0) {
            snprintf(buf, sizeof(buf), "#%d (LAP %d-FL)", telemetry_driver_no_, ln);
        } else if (acr != nullptr && acr[0] && pos > 0) {
            snprintf(buf, sizeof(buf), "%s #%02d", acr, pos);
        } else if (acr != nullptr && acr[0]) {
            snprintf(buf, sizeof(buf), "%s", acr);
        } else if (telemetry_driver_no_ > 0) {
            snprintf(buf, sizeof(buf), "#%d", telemetry_driver_no_);
        } else {
            snprintf(buf, sizeof(buf), "--");
        }
        SetText(race_sessions_header_center_, buf);
    }

    if (race_sessions_ticker_ != nullptr) {
        SetText(race_sessions_ticker_, "[UP/DN] SWITCH DRIVER | [CONFIRM] BACK TO RESULTS");
    }

    if (telemetry_meta_ != nullptr) {
        const std::string total = FmtClock(telemetry_meta_lap_duration_s_);
        const std::string s1 = FmtClock(telemetry_meta_s1_s_);
        const std::string s2 = FmtClock(telemetry_meta_s2_s_);
        const std::string s3 = FmtClock(telemetry_meta_s3_s_);
        char line[128];
        snprintf(line, sizeof(line), "TIME: %s | S1: %s | S2: %s | S3: %s", total.c_str(), s1.c_str(), s2.c_str(), s3.c_str());
        SetText(telemetry_meta_, line);
    }

    int x = 4;
    int y = 0;
    int w = 1;
    int h = 1;
    if (race_sessions_telemetry_body_ != nullptr) {
        y = static_cast<int>(lv_obj_get_y(race_sessions_telemetry_body_)) + 4;
        w = static_cast<int>(lv_obj_get_width(race_sessions_telemetry_body_)) - 8;
        h = static_cast<int>(lv_obj_get_height(race_sessions_telemetry_body_)) - (f1_page_internal::kRowH * 2) - 10;
    }
    if (w <= 0) {
        w = 1;
    }
    if (h <= 0) {
        h = 1;
    }
    telemetry_chart_x_ = x;
    telemetry_chart_y_ = y;
    telemetry_chart_w_ = w;
    telemetry_chart_h_ = h;

    const bool has_chart = !telemetry_chart_bytes_.empty();
    if (telemetry_graph_ != nullptr) {
        if (telemetry_analysis_loading_) {
            lv_label_set_text(telemetry_graph_, "LOADING CHART...");
            lv_obj_clear_flag(telemetry_graph_, LV_OBJ_FLAG_HIDDEN);
        } else if (!has_chart) {
            lv_label_set_text(telemetry_graph_, "NO CHART");
            lv_obj_clear_flag(telemetry_graph_, LV_OBJ_FLAG_HIDDEN);
        } else {
            lv_obj_add_flag(telemetry_graph_, LV_OBJ_FLAG_HIDDEN);
        }
    }

    if (host_ != nullptr) {
        if (has_chart) {
            host_->UpdatePicRegion(x, y, w, h, telemetry_chart_bytes_.data(), telemetry_chart_bytes_.size());
        } else {
            host_->UpdatePicRegion(x, y, w, h, nullptr, 0);
        }
    }

    if (telemetry_no_data_ != nullptr) {
        lv_obj_add_flag(telemetry_no_data_, LV_OBJ_FLAG_HIDDEN);
    }
}
