#ifndef F1_PAGE_ADAPTER_PAYLOADS_H
#define F1_PAGE_ADAPTER_PAYLOADS_H

#include <cstdint>
#include <string>
#include <vector>

namespace f1_page_internal {

struct CircuitImagePayload {
    std::string url;
    std::string final_url;
    int status = 0;
    std::vector<uint8_t> bytes;
};

struct CircuitDetailImagePayload {
    std::string url;
    std::string final_url;
    int status = 0;
    std::vector<uint8_t> bytes;
};

}  // namespace f1_page_internal

#endif  // F1_PAGE_ADAPTER_PAYLOADS_H
