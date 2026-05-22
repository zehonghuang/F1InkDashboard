#ifndef OVERLAY_MENU_PAGE_ADAPTER_H
#define OVERLAY_MENU_PAGE_ADAPTER_H

#include "ui_page.h"

#include <functional>
#include <string>
#include <vector>

class LcdDisplay;

class OverlayMenuPageAdapter : public IUiPage {
public:
    explicit OverlayMenuPageAdapter(LcdDisplay* host);
    ~OverlayMenuPageAdapter() override = default;

    UiPageId Id() const override;
    const char* Name() const override;
    void Build() override;
    lv_obj_t* Screen() const override;
    void OnShow() override;
    void OnHide() override;
    bool HandleEvent(const UiPageEvent& event) override;

    void Update(const std::string& title, std::vector<std::string> items, int selected = 0);
    void SetOnSelect(std::function<void(int index, const std::string& item)>&& cb);

private:
    void RenderLocked();
    void UpdateSelectionLocked(int next);

    LcdDisplay* host_ = nullptr;
    bool built_ = false;
    bool active_ = false;
    lv_obj_t* screen_ = nullptr;
    lv_obj_t* title_ = nullptr;
    lv_obj_t* list_label_ = nullptr;

    std::string title_text_;
    std::vector<std::string> items_;
    int selected_ = 0;
    std::function<void(int index, const std::string& item)> on_select_;
};

#endif  // OVERLAY_MENU_PAGE_ADAPTER_H
