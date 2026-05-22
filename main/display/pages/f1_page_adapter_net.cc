#include "pages/f1_page_adapter_net.h"

#include <cstring>

bool ParsePngSize(const uint8_t* data, size_t size, uint32_t& w, uint32_t& h) {
    static const uint8_t sig[8] = {0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a};
    if (size < 24) {
        return false;
    }
    if (memcmp(data, sig, sizeof(sig)) != 0) {
        return false;
    }
    w = (static_cast<uint32_t>(data[16]) << 24) | (static_cast<uint32_t>(data[17]) << 16) |
        (static_cast<uint32_t>(data[18]) << 8) | static_cast<uint32_t>(data[19]);
    h = (static_cast<uint32_t>(data[20]) << 24) | (static_cast<uint32_t>(data[21]) << 16) |
        (static_cast<uint32_t>(data[22]) << 8) | static_cast<uint32_t>(data[23]);
    return w > 0 && h > 0;
}

bool ParsePngIhdr(const uint8_t* data,
                  size_t size,
                  uint32_t& w,
                  uint32_t& h,
                  uint8_t& bit_depth,
                  uint8_t& color_type,
                  uint8_t& compression,
                  uint8_t& filter,
                  uint8_t& interlace) {
    static const uint8_t sig[8] = {0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a};
    if (data == nullptr || size < 33) {
        return false;
    }
    if (memcmp(data, sig, sizeof(sig)) != 0) {
        return false;
    }
    const uint32_t len = (static_cast<uint32_t>(data[8]) << 24) | (static_cast<uint32_t>(data[9]) << 16) |
                         (static_cast<uint32_t>(data[10]) << 8) | static_cast<uint32_t>(data[11]);
    if (len < 13) {
        return false;
    }
    if (memcmp(data + 12, "IHDR", 4) != 0) {
        return false;
    }
    w = (static_cast<uint32_t>(data[16]) << 24) | (static_cast<uint32_t>(data[17]) << 16) |
        (static_cast<uint32_t>(data[18]) << 8) | static_cast<uint32_t>(data[19]);
    h = (static_cast<uint32_t>(data[20]) << 24) | (static_cast<uint32_t>(data[21]) << 16) |
        (static_cast<uint32_t>(data[22]) << 8) | static_cast<uint32_t>(data[23]);
    bit_depth = data[24];
    color_type = data[25];
    compression = data[26];
    filter = data[27];
    interlace = data[28];
    return w > 0 && h > 0;
}

uint32_t Fnv1a32(const char* s) {
    uint32_t h = 2166136261u;
    if (s == nullptr) {
        return h;
    }
    for (const unsigned char* p = reinterpret_cast<const unsigned char*>(s); *p; p++) {
        h ^= static_cast<uint32_t>(*p);
        h *= 16777619u;
    }
    return h;
}
