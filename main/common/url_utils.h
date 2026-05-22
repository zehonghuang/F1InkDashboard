#ifndef URL_UTILS_H
#define URL_UTILS_H

#include <string>

std::string TrimUrl(std::string s);
std::string JoinUrl(const std::string& base, const std::string& path);
std::string BaseUrlFromApiUrl(const std::string& api_url);

#endif  // URL_UTILS_H
