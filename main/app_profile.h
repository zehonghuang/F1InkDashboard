#ifndef APP_PROFILE_H
#define APP_PROFILE_H

#include "display/ui_page.h"

UiPageId GetMainUiPageId();
bool IsMainUiPageId(UiPageId id);
bool AllowLightSleepWhenActivePage(UiPageId active_page_id);

#endif  // APP_PROFILE_H
