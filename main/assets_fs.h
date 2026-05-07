#ifndef ASSETS_FS_H
#define ASSETS_FS_H

#include <cstddef>
#include <string>
#include <vector>

bool EnsureAssetsMounted();
bool ReadAssetsFile(const std::string& path, std::vector<uint8_t>& out, size_t max_bytes);

#endif  // ASSETS_FS_H
