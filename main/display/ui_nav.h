#ifndef UI_NAV_H
#define UI_NAV_H

#include <cstdint>
#include <vector>

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

