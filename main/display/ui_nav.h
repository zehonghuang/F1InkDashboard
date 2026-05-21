#ifndef UI_NAV_H
#define UI_NAV_H

#include <cstdint>
#include <vector>

/*
================================================================================
UiNavController: UI "page tree" controller (root toggle + stack)
================================================================================

This controller is a tiny navigation state machine designed for "one page with
multiple internal views" (e.g. F1PageAdapter), rather than the global page stack
owned by LcdDisplay.

It models navigation as:
  - Two interchangeable roots: root_a <-> root_b (typically RaceRoot / OffRoot)
  - A stack of nodes: [root, child, ...]

The controller is generic:
  Node     : an enum (or small POD) representing a UI view
  Delegate : the page adapter that owns view state + LVGL widgets

Data structure (stack_)
-----------------------

  stack_ = [ root ]                   // depth=1, IsAtRoot()==true
  stack_ = [ root, child ]            // depth=2, IsAtRoot()==false

ASCII view:

  +----------------------------+
  | root = RaceRoot / OffRoot  |  <---- ToggleRoot() only works here (depth<=1)
  +--------------+-------------+
                 |
                 | Enter() resolves a child based on root focus slot
                 v
          +--------------+
          |   child      |  <---- Back() pops stack, returns to root
          +--------------+

Key rule: only Enter() from root
--------------------------------
Enter() is intentionally limited:
  - Only allowed when IsAtRoot()==true.
  - It maps a root "focus slot" -> a child node via UiNavResolveChild().

This fits the "4-quadrant home" UX:
  - root has N focus slots (usually 4)
  - focused slot decides which child page to enter

Prev/Next routing model
-----------------------

When IsAtRoot()==true:
  Prev()/Next() cycles root focus slot (wrap), then calls UiNavActivate(root).

When IsAtRoot()==false:
  Prev() calls UiNavPrev(Current()).
    - if delegate returns false, Prev() falls back to Back() (exit child).
  Next() calls UiNavNext(Current()).
    - no auto Back(); the child decides what Next means.

Delegate contract (methods UiNavController calls)
-------------------------------------------------
Delegate must provide:

  int  UiNavRootSlotCount(Node root);
  int  UiNavRootFocus(Node root);
  void UiNavSetRootFocus(Node root, int focus);
  bool UiNavResolveChild(Node root, int focus, Node& out_child);

  bool UiNavPrev(Node node);      // return false to indicate "cannot prev"
  void UiNavNext(Node node);      // no return; child decides boundaries

  void UiNavActivate(Node node);  // "apply this view": show/hide LVGL roots,
                                  // build/rebuild page, start fetch, etc.

Typical usage in F1PageAdapter
------------------------------
Node = F1PageAdapter::NavNode (RaceRoot/OffRoot/Wdc/Wcc/Circuit/RaceSessions)
Root focus slot count is fixed at 4 quadrants.

UiNavActivate(node) maps node -> view_index_ and calls ApplyViewLocked() to
switch visibility among:
  race_root_, standings_root_, wdc_root_, wcc_root_, circuit_root_,
  race_sessions_root_.
================================================================================
*/

template <typename Node, typename Delegate>
class UiNavController {
public:
    UiNavController(Delegate* delegate, Node root_a, Node root_b)
        : d_(delegate), root_a_(root_a), root_b_(root_b), root_(root_a) {
        stack_.push_back(root_);
    }

    Node Root() const { return root_; }
    Node Current() const { return stack_.empty() ? root_ : stack_.back(); }
    size_t Depth() const { return stack_.size(); }
    bool IsAtRoot() const { return stack_.size() <= 1; }

    void SetRoot(Node r) {
        root_ = r;
        stack_.clear();
        stack_.push_back(root_);
        d_->UiNavActivate(root_);
    }

    void ToggleRoot() {
        if (!IsAtRoot()) {
            return;
        }
        SetRoot(root_ == root_a_ ? root_b_ : root_a_);
    }

    void Back() {
        if (IsAtRoot()) {
            return;
        }
        stack_.pop_back();
        d_->UiNavActivate(stack_.back());
    }

    void Enter() {
        if (!IsAtRoot()) {
            return;
        }
        Node child{};
        if (!d_->UiNavResolveChild(root_, d_->UiNavRootFocus(root_), child)) {
            return;
        }
        stack_.push_back(child);
        d_->UiNavActivate(child);
    }

    void Prev() {
        if (IsAtRoot()) {
            const int n = d_->UiNavRootSlotCount(root_);
            if (n <= 0) {
                return;
            }
            int f = d_->UiNavRootFocus(root_);
            f = (f + (n - 1)) % n;
            d_->UiNavSetRootFocus(root_, f);
            d_->UiNavActivate(root_);
            return;
        }
        if (!d_->UiNavPrev(Current())) {
            Back();
        }
    }

    void Next() {
        if (IsAtRoot()) {
            const int n = d_->UiNavRootSlotCount(root_);
            if (n <= 0) {
                return;
            }
            int f = d_->UiNavRootFocus(root_);
            f = (f + 1) % n;
            d_->UiNavSetRootFocus(root_, f);
            d_->UiNavActivate(root_);
            return;
        }
        d_->UiNavNext(Current());
    }

private:
    Delegate* d_ = nullptr;
    Node root_a_;
    Node root_b_;
    Node root_;
    std::vector<Node> stack_;
};

#endif  // UI_NAV_H

