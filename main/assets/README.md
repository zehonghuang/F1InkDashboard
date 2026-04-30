# Assets Directory

固定资源目录：`main/assets`

Gallery 页面会优先读取：

- `/assets/gallery/list.json`
- JSON 中列出的图片路径（例如 `gallery/a.png`）

## 推荐目录结构

```text
main/assets/
  gallery/
    list.json
    a.png
    b.png
```

## 打包命令

在项目根目录执行：

```powershell
. "C:\Espressif\tools\Microsoft.v5.4.4.PowerShell_profile.ps1"
python "$env:IDF_PATH\components\spiffs\spiffsgen.py" 0x800000 .\main\assets .\scripts\spiffs_assets\build\assets.bin --page-size=256 --obj-name-len=32 --meta-len=4 --use-magic --use-magic-len
```

输出文件：

- `scripts/spiffs_assets/build/assets.bin`

## 烧录 assets 分区

```powershell
parttool.py --port COM4 --partition-table-file build/partition_table/partition-table.bin write_partition --partition-name assets --input scripts/spiffs_assets/build/assets.bin
```

或者直接一键：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build_assets.ps1 -Port COM4
```
