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

    const bool is_miami_quali = (telemetry_meta_url_.find("/static/assets/miami/miami_quali_driver_") != std::string::npos &&
                                 telemetry_meta_url_.find("_final.") != std::string::npos);

    if (race_sessions_header_left_ != nullptr) {
        SetText(race_sessions_header_left_, "[ANALYSIS]");
    }

    if (race_sessions_header_center_ != nullptr) {
        char buf[96];
        const char* acr = telemetry_driver_acr_.empty() ? nullptr : telemetry_driver_acr_.c_str();
        const int pos = telemetry_driver_pos_;
        const int dn = telemetry_driver_no_;
        const int ln = telemetry_meta_lap_number_;
        if (!is_miami_quali && acr != nullptr && acr[0] && dn > 0 && pos > 0 && ln > 0) {
            snprintf(buf, sizeof(buf), "%s #%02d P%d %d-FL", acr, dn, pos, ln);
        } else if (!is_miami_quali && acr != nullptr && acr[0] && dn > 0 && ln > 0) {
            snprintf(buf, sizeof(buf), "%s #%02d %d-FL", acr, dn, ln);
        } else if (!is_miami_quali && dn > 0 && pos > 0 && ln > 0) {
            snprintf(buf, sizeof(buf), "#%02d P%d %d-FL", dn, pos, ln);
        } else if (acr != nullptr && acr[0] && dn > 0 && pos > 0) {
            snprintf(buf, sizeof(buf), "%s #%02d P%d", acr, dn, pos);
        } else if (acr != nullptr && acr[0] && dn > 0) {
            snprintf(buf, sizeof(buf), "%s #%02d", acr, dn);
        } else if (acr != nullptr && acr[0] && pos > 0) {
            snprintf(buf, sizeof(buf), "%s P%d", acr, pos);
        } else if (acr != nullptr && acr[0]) {
            snprintf(buf, sizeof(buf), "%s", acr);
        } else if (dn > 0 && pos > 0 && ln > 0) {
            snprintf(buf, sizeof(buf), "#%02d P%d %d-FL", dn, pos, ln);
        } else if (dn > 0 && ln > 0) {
            snprintf(buf, sizeof(buf), "#%02d %d-FL", dn, ln);
        } else if (dn > 0 && pos > 0) {
            snprintf(buf, sizeof(buf), "#%02d P%d", dn, pos);
        } else if (dn > 0) {
            snprintf(buf, sizeof(buf), "#%02d", dn);
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
        snprintf(line, sizeof(line), "TIME: %s\nS1: %s | S2: %s | S3: %s", total.c_str(), s1.c_str(), s2.c_str(), s3.c_str());
        SetText(telemetry_meta_, line);
        lv_obj_clear_flag(telemetry_meta_, LV_OBJ_FLAG_HIDDEN);
    }

    int x = 4;
    int y = 0;
    int w = 1;
    int h = 1;
    lv_obj_t* box = nullptr;
    if (telemetry_graph_ != nullptr) {
        box = lv_obj_get_parent(telemetry_graph_);
    }
    if (box != nullptr) {
        constexpr int kInset = 0;
        lv_area_t a{};
        lv_obj_get_coords(box, &a);
        x = a.x1 + kInset;
        y = a.y1 + kInset;
        w = (a.x2 - a.x1 + 1) - kInset * 2;
        h = (a.y2 - a.y1 + 1) - kInset * 2;
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

    const size_t expected = static_cast<size_t>((w + 7) >> 3) * static_cast<size_t>(h);
    bool has_chart = !telemetry_chart_bytes_.empty();
    if (has_chart && telemetry_chart_bytes_.size() != expected) {
        ESP_LOGW(f1_page_internal::kTag, "telemetry frame size mismatch got=%u exp=%u url=%s",
                 static_cast<unsigned>(telemetry_chart_bytes_.size()),
                 static_cast<unsigned>(expected),
                 telemetry_chart_url_.c_str());
        telemetry_chart_bytes_.clear();
        has_chart = false;
    }
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
            host_->RequestDebouncedRefresh(150);
        } else {
            host_->UpdatePicRegion(x, y, w, h, nullptr, 0);
        }
    }
    if (box != nullptr) {
        lv_obj_invalidate(box);
    }

    if (telemetry_no_data_ != nullptr) {
        lv_obj_add_flag(telemetry_no_data_, LV_OBJ_FLAG_HIDDEN);
    }
}
