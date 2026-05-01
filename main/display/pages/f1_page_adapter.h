#ifndef F1_PAGE_ADAPTER_H
#define F1_PAGE_ADAPTER_H

#include "ui_page.h"
#include "ui_nav.h"

#include <array>
#include <atomic>
#include <string>
#include <vector>

#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

class LcdDisplay;

class F1PageAdapter : public IUiPage {
public:
    explicit F1PageAdapter(LcdDisplay* host);
    ~F1PageAdapter() override;

    UiPageId Id() const override;
    const char* Name() const override;
    void Build() override;
    lv_obj_t* Screen() const override;
    void OnShow() override;
    void OnHide() override;
    bool HandleEvent(const UiPageEvent& event) override;
    void MarkFetchDone();
    void MarkCircuitFetchDone();
    void MarkCircuitDetailFetchDone();
    void MarkSessionsFetchDone();

private:
    template <typename, typename>
    friend class UiNavController;

    enum class NavNode : uint8_t { RaceRoot = 0, OffRoot = 1, Wdc = 2, Wcc = 3, Circuit = 4, RaceSessions = 5 };

    enum class RaceSessionsSubPage : uint8_t { QualiResult = 0, RaceResult = 1, QualiLive = 2, RaceLive = 3 };

    static void RefreshTimerCallback(void* arg);

    void BuildRaceLocked();
    void BuildRaceLiveLocked();
    void BuildStandingsLocked();
    void BuildWdcDetailLocked();
    void BuildWccDetailLocked();
    void BuildRaceSessionsLocked();
    void BuildMenuLocked();
    void ApplyViewLocked();
    void StartFetchIfNeededLocked(bool force);
    void StartSessionsFetchIfNeededLocked(bool force);
    void StartCircuitFetchIfNeededLocked(const char* map_url);
    void StartCircuitDetailFetchIfNeededLocked(const char* map_url);
    void ApplyCircuitImageLocked();
    void ApplyCircuitDetailImageLocked();
    bool ApplyUiJsonLocked(const char* json_text, size_t len);
    bool ApplySessionsJsonLocked(const char* json_text, size_t len);
    void RenderRaceRightFormula1Locked();
    void SetText(lv_obj_t* label, const char* text);
    void SetTextFmt(lv_obj_t* label, const char* fmt, int v);
    void RestartRefreshTimerLocked();
    void UpdateOffWeekSelectionLocked();
    void UpdateRaceDaySelectionLocked();
    void SetRootVisible(lv_obj_t* root, bool visible);
    void ApplyMenuSelectionLocked();
    void UpdateMenuStatusLocked();
    void ApplyWdcPageLocked();
    void ApplyWccPageLocked();
    void BuildCircuitDetailLocked();
    void ApplyCircuitDetailLocked();
    void ApplyRaceSessionsLocked();
    void ApplyQualiResultPageLocked();
    void ApplyRaceResultPageLocked();
    void MaybeAutoEnterRaceLiveLocked();
    int UiNavRootSlotCount(NavNode root);
    int UiNavRootFocus(NavNode root);
    void UiNavSetRootFocus(NavNode root, int focus);
    bool UiNavResolveChild(NavNode root, int focus, NavNode& out);
    bool UiNavPrev(NavNode node);
    void UiNavNext(NavNode node);
    void UiNavActivate(NavNode node);

    LcdDisplay* host_ = nullptr;
    bool built_ = false;
    lv_obj_t* screen_ = nullptr;

    lv_obj_t* race_root_ = nullptr;
    lv_obj_t* standings_root_ = nullptr;
    lv_obj_t* wdc_root_ = nullptr;
    lv_obj_t* wcc_root_ = nullptr;
    lv_obj_t* circuit_root_ = nullptr;
    lv_obj_t* race_sessions_root_ = nullptr;
    lv_obj_t* circuit_map_root_ = nullptr;
    lv_obj_t* circuit_stats_root_ = nullptr;
    lv_obj_t* menu_root_ = nullptr;

    int view_index_ = 0;
    int off_week_focus_ = 0;
    int wdc_page_ = 0;
    int wdc_page_count_ = 1;
    int wcc_page_ = 0;
    int wcc_page_count_ = 1;
    int circuit_page_ = 0;
    int race_day_focus_ = 0;
    int race_sessions_page_ = 0;
    int64_t race_live_start_ms_ = 0;
    bool race_live_auto_entered_ = false;
    std::array<int8_t, 4> nav_children_race_{};
    std::array<int8_t, 4> nav_children_off_{};
    UiNavController<NavNode, F1PageAdapter> nav_;

    lv_obj_t* status_time_ = nullptr;
    lv_obj_t* status_date_ = nullptr;
    lv_obj_t* status_battery_ = nullptr;

    lv_obj_t* race_gp_ = nullptr;
    lv_obj_t* race_round_ = nullptr;
    lv_obj_t* race_next_label_ = nullptr;
    lv_obj_t* race_countdown_ = nullptr;
    lv_obj_t* race_next_gp_ = nullptr;
    lv_obj_t* race_right_canvas_ = nullptr;
    void* race_right_canvas_buf_ = nullptr;
    lv_obj_t* race_track_box_ = nullptr;
    lv_obj_t* race_track_image_ = nullptr;
    lv_obj_t* race_track_placeholder_ = nullptr;
    lv_obj_t* race_q1_ = nullptr;
    lv_obj_t* race_q2_ = nullptr;
    lv_obj_t* race_q3_ = nullptr;
    lv_obj_t* race_q4_ = nullptr;

    static constexpr int kScheduleRows = 5;
    static constexpr int kScheduleCols = 4;
    std::array<std::array<lv_obj_t*, kScheduleCols>, kScheduleRows> schedule_cells_{};

    static constexpr int kWeatherRows = 5;
    std::array<lv_obj_t*, kWeatherRows> weather_k_{};
    std::array<lv_obj_t*, kWeatherRows> weather_v_{};

    lv_obj_t* standings_header_left_ = nullptr;
    lv_obj_t* standings_header_right_ = nullptr;
    lv_obj_t* standings_days_ = nullptr;
    lv_obj_t* news_ = nullptr;
    lv_obj_t* off_q1_ = nullptr;
    lv_obj_t* off_q2_ = nullptr;
    lv_obj_t* off_q3_ = nullptr;
    lv_obj_t* off_q4_ = nullptr;

    static constexpr int kDriverRows = 5;
    static constexpr int kDriverCols = 4;
    std::array<std::array<lv_obj_t*, kDriverCols>, kDriverRows> driver_cells_{};

    static constexpr int kConstructorRows = 3;
    static constexpr int kConstructorCols = 3;
    std::array<std::array<lv_obj_t*, kConstructorCols>, kConstructorRows> constructor_cells_{};

    static constexpr int kWdcRows = 8;
    static constexpr int kWdcCols = 5;
    lv_obj_t* wdc_title_ = nullptr;
    lv_obj_t* wdc_page_label_ = nullptr;
    std::array<std::array<lv_obj_t*, kWdcCols>, kWdcRows> wdc_cells_{};

    static constexpr int kWccRows = 8;
    static constexpr int kWccCols = 6;
    lv_obj_t* wcc_title_ = nullptr;
    lv_obj_t* wcc_page_label_ = nullptr;
    std::array<std::array<lv_obj_t*, kWccCols>, kWccRows> wcc_cells_{};

    std::vector<std::array<std::string, kWdcCols>> wdc_rows_;
    std::vector<std::array<std::string, kWccCols>> wcc_rows_;

    std::atomic<bool> fetch_inflight_{false};
    int64_t last_fetch_ms_ = 0;
    int64_t last_attempt_ms_ = 0;
    int64_t refresh_interval_ms_ = 60LL * 60 * 1000;
    bool is_race_week_ = false;
    bool pending_sessions_force_fetch_ = false;
    esp_timer_handle_t refresh_timer_ = nullptr;
    bool news_beeped_this_boot_ = false;

    std::atomic<bool> circuit_fetch_inflight_{false};
    std::string api_url_;
    std::string circuit_image_url_;
    std::vector<uint8_t> circuit_image_bytes_;
    std::vector<uint16_t> circuit_image_rgb565_pixels_;
    lv_image_dsc_t circuit_image_dsc_{};
    bool circuit_image_pic_active_ = false;

    std::atomic<bool> circuit_detail_fetch_inflight_{false};
    std::string circuit_detail_image_url_;
    std::vector<uint8_t> circuit_detail_image_bytes_;
    std::vector<uint16_t> circuit_detail_image_rgb565_pixels_;
    lv_image_dsc_t circuit_detail_image_dsc_{};
    bool circuit_detail_pic_active_ = false;

    lv_obj_t* circuit_header_left_ = nullptr;
    lv_obj_t* circuit_header_center_ = nullptr;
    lv_obj_t* circuit_header_right_ = nullptr;
    lv_obj_t* circuit_footer_ = nullptr;
    lv_obj_t* circuit_map_image_ = nullptr;
    lv_obj_t* circuit_map_placeholder_ = nullptr;
    lv_obj_t* circuit_stats_title_ = nullptr;
    std::array<lv_obj_t*, 8> circuit_stats_k_{};
    std::array<lv_obj_t*, 8> circuit_stats_v_{};

    lv_obj_t* race_sessions_header_left_ = nullptr;
    lv_obj_t* race_sessions_header_center_ = nullptr;
    lv_obj_t* race_sessions_header_right_ = nullptr;
    lv_obj_t* race_sessions_header_root_ = nullptr;
    lv_obj_t* race_sessions_header_batt_icon_ = nullptr;
    lv_obj_t* race_sessions_header_batt_pct_ = nullptr;
    lv_obj_t* race_sessions_body_left_ = nullptr;
    lv_obj_t* race_sessions_body_right_ = nullptr;
    lv_obj_t* race_sessions_qualifying_body_ = nullptr;
    lv_obj_t* race_sessions_race_result_body_ = nullptr;
    lv_obj_t* race_sessions_race_dnf_ = nullptr;
    lv_obj_t* race_sessions_practice_left_ = nullptr;
    lv_obj_t* race_sessions_qualifying_left_ = nullptr;
    lv_obj_t* race_sessions_practice_right_ = nullptr;
    lv_obj_t* race_sessions_qualifying_right_ = nullptr;
    lv_obj_t* race_sessions_race_hdr_best_ = nullptr;
    lv_obj_t* race_sessions_race_hdr_gap_ = nullptr;
    lv_obj_t* race_sessions_race_hdr_laps_ = nullptr;
    lv_obj_t* race_sessions_quali_live_root_ = nullptr;
    lv_obj_t* race_sessions_race_live_root_ = nullptr;
    lv_obj_t* race_sessions_ticker_ = nullptr;
    lv_obj_t* race_sessions_footer_root_ = nullptr;
    lv_obj_t* race_sessions_no_data_ = nullptr;

    lv_obj_t* menu_header_left_ = nullptr;
    lv_obj_t* menu_header_right_ = nullptr;
    std::array<lv_obj_t*, 7> menu_item_boxes_{};
    std::array<lv_obj_t*, 7> menu_item_left_{};
    std::array<lv_obj_t*, 7> menu_item_right_{};
    lv_obj_t* menu_footer_ = nullptr;
    int menu_focus_ = 0;
    bool menu_visible_ = false;

    lv_obj_t* live_header_left_ = nullptr;
    lv_obj_t* live_header_center_ = nullptr;
    lv_obj_t* live_header_time_ = nullptr;
    lv_obj_t* live_header_batt_icon_ = nullptr;
    lv_obj_t* live_header_batt_pct_ = nullptr;

    static constexpr int kLiveRows = 10;
    static constexpr int kLiveCols = 5;
    std::array<std::array<lv_obj_t*, kLiveCols>, kLiveRows> live_cells_{};

    lv_obj_t* live_track_status_ = nullptr;
    lv_obj_t* live_fastest_lap_ = nullptr;
    lv_obj_t* live_temps_ = nullptr;
    lv_obj_t* live_page_ = nullptr;

    static constexpr int kSessionsPracticeRows = 10;
    static constexpr int kSessionsPracticeCols = 6;
    std::array<std::array<lv_obj_t*, kSessionsPracticeCols>, kSessionsPracticeRows> sessions_practice_cells_{};

    static constexpr int kSessionsQualiRows = 11;
    static constexpr int kSessionsQualiCols = 7;
    std::array<std::array<lv_obj_t*, kSessionsQualiCols>, kSessionsQualiRows> sessions_quali_cells_{};
    lv_obj_t* sessions_drop_zone_ = nullptr;

    int quali_result_page_ = 0;
    int quali_result_page_count_ = 1;
    std::vector<std::array<std::string, kSessionsQualiCols>> quali_result_rows_{};

    int race_result_page_ = 0;
    int race_result_page_count_ = 1;
    std::vector<std::array<std::string, kSessionsPracticeCols>> race_result_rows_{};
    std::string race_result_dnf_{};

    std::atomic<bool> sessions_fetch_inflight_{false};
    int64_t last_sessions_fetch_ms_ = 0;
    std::string sessions_url_;
    int64_t sessions_generated_at_utc_s_ = 0;
    bool sessions_quali_use_prev_round_ = false;
    int sessions_quali_prev_round_ = -1;
    int64_t sessions_quali_prev_round_until_utc_s_ = 0;
    bool sessions_race_use_prev_round_ = false;
    int sessions_race_prev_round_ = -1;
    int64_t sessions_race_prev_round_until_utc_s_ = 0;

    bool active_ = false;
    std::string circuit_name_;
    std::string circuit_gp_;
    std::string circuit_map_url_small_;
    std::string circuit_map_url_detail_;
    double circuit_length_km_ = -1;
    double race_distance_km_ = -1;
    int number_of_laps_ = -1;
    int first_grand_prix_year_ = -1;
    std::string fastest_lap_time_;
    std::string fastest_lap_driver_;
    int fastest_lap_year_ = -1;
};

#endif  // F1_PAGE_ADAPTER_H
