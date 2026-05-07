#ifndef F1_PAGE_ADAPTER_NET_H
#define F1_PAGE_ADAPTER_NET_H

#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

bool ParsePngSize(const uint8_t* data, size_t size, uint32_t& w, uint32_t& h);
bool ParsePngIhdr(const uint8_t* data,
                  size_t size,
                  uint32_t& w,
                  uint32_t& h,
                  uint8_t& bit_depth,
                  uint8_t& color_type,
                  uint8_t& compression,
                  uint8_t& filter,
                  uint8_t& interlace);
std::string BaseUrlFromApiUrl(const std::string& api_url);
std::string JoinUrl(const std::string& base, const std::string& path);
std::string TrimUrl(std::string s);
uint32_t Fnv1a32(const char* s);
bool HttpGetToBuffer(const std::string& url, std::vector<uint8_t>& out, size_t max_bytes);
bool HttpGetToBufferEx(const std::string& url,
                       std::vector<uint8_t>& out,
                       size_t max_bytes,
                       int* out_status,
                       std::string* out_final_url,
                       std::string* out_content_type);

#endif  // F1_PAGE_ADAPTER_NET_H
