#include "assets_fs.h"

#include <cstdio>

#include "esp_log.h"
#include "esp_spiffs.h"

namespace {

constexpr const char* kTag = "AssetsFs";

bool g_mounted = false;

std::string NormalizePath(const std::string& path) {
    if (path.rfind("/assets/", 0) == 0) {
        return path;
    }
    if (!path.empty() && path[0] == '/') {
        return std::string("/assets") + path;
    }
    return std::string("/assets/") + path;
}

}  // namespace

bool EnsureAssetsMounted() {
    if (g_mounted) {
        return true;
    }

    esp_vfs_spiffs_conf_t conf = {};
    conf.base_path = "/assets";
    conf.partition_label = "assets";
    conf.max_files = 8;
    conf.format_if_mount_failed = false;

    const esp_err_t ret = esp_vfs_spiffs_register(&conf);
    if (ret != ESP_OK) {
        ESP_LOGE(kTag, "spiffs mount failed: %s", esp_err_to_name(ret));
        return false;
    }

    g_mounted = true;
    return true;
}

bool ReadAssetsFile(const std::string& path, std::vector<uint8_t>& out, size_t max_bytes) {
    if (!EnsureAssetsMounted()) {
        return false;
    }

    const std::string full_path = NormalizePath(path);
    FILE* f = fopen(full_path.c_str(), "rb");
    if (f == nullptr) {
        return false;
    }

    if (fseek(f, 0, SEEK_END) != 0) {
        fclose(f);
        return false;
    }
    const long size = ftell(f);
    if (size < 0 || static_cast<size_t>(size) > max_bytes) {
        fclose(f);
        return false;
    }
    if (fseek(f, 0, SEEK_SET) != 0) {
        fclose(f);
        return false;
    }

    out.resize(static_cast<size_t>(size));
    const size_t read = fread(out.data(), 1, out.size(), f);
    fclose(f);
    if (read != out.size()) {
        out.clear();
        return false;
    }
    return true;
}
