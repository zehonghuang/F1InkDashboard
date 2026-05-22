#ifndef HTTP_FETCH_H
#define HTTP_FETCH_H

#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

bool HttpGetToBuffer(const std::string& url, std::vector<uint8_t>& out, size_t max_bytes);
bool HttpGetToBufferEx(const std::string& url,
                       std::vector<uint8_t>& out,
                       size_t max_bytes,
                       int* out_status,
                       std::string* out_final_url,
                       std::string* out_content_type);

#endif  // HTTP_FETCH_H
