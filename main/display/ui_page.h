#ifndef UI_PAGE_H
#define UI_PAGE_H

#include "display.h"

#include <cstdint>

#include <lvgl.h>

enum class UiPageId : uint8_t {
    FactoryTest = 0,
    WifiSetup = 1,
    F1 = 2,
    Gallery = F1,
};

enum class UiPageEventType : uint8_t {
    Custom = 0,
};

enum class UiPageCustomEventId : int32_t {
    PagePrev = 100,
    PageNext = 101,
    JumpRaceDay = 102,
    JumpOffWeek = 103,
    ConfirmClick = 110,
    ConfirmLongPress = 111,
    ConfirmDoubleClick = 112,
    PagePrevDoubleClick = 113,
    PageNextDoubleClick = 114,
    ComboUpDown = 120,
    ComboUpConfirm = 121,
    ComboDownConfirm = 122,
    ComboAll = 123,
    F1Data = 200,
    F1Tick = 201,
    F1CircuitImage = 202,
    F1CircuitDetailImage = 203,
    F1SessionsData = 204,
    F1ForceSessionsFetch = 205,
    F1OpenF1WsEvent = 206,
    WsOverlayShow = 300,
    GalleryPrev = PagePrev,
    GalleryNext = PageNext,
};

struct UiPageEvent {
    UiPageEventType type = UiPageEventType::Custom;
    int32_t i32 = 0;
    const char* text = nullptr;
    void* ptr = nullptr;
};

enum class UiRefreshHint : uint8_t {
    None = 0,
    Partial,
    UrgentFull,
};

class IUiPage {
public:
    virtual ~IUiPage() = default;
    virtual UiPageId Id() const = 0;
    virtual const char* Name() const = 0;
    virtual void Build() = 0;
    virtual lv_obj_t* Screen() const = 0;
    virtual void OnShow() {}
    virtual void OnHide() {}
    virtual bool HandleEvent(const UiPageEvent& event) {
        (void)event;
        return false;
    }
    virtual UiRefreshHint ConsumeRefreshHint() { return UiRefreshHint::None; }
    virtual void OnThemeChanged(Theme* theme) { (void)theme; }
};

#endif  // UI_PAGE_H
