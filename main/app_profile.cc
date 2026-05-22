#include "app_profile.h"

UiPageId GetMainUiPageId() {
    return UiPageId::F1;
}

bool IsMainUiPageId(UiPageId id) {
    return id == GetMainUiPageId();
}

bool AllowLightSleepWhenActivePage(UiPageId active_page_id) {
    return IsMainUiPageId(active_page_id);
}

