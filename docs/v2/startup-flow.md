# 启动后页面显示内容说明（首开机 -> 进入界面 -> 待机）

本文只描述“屏幕上会看到什么”，不展开底层调用细节。

## 1. 总结（先看结果）

- 当前固件启动后只会显示 `FactoryTest` 页面。
- 不存在独立“待机界面（Standby Page）”。
- 也不会进入系统待机态页面：`Application::CanEnterSleepMode()` 当前固定为 `false`。

## 2. 开机到首屏：实际显示内容

### 2.1 页面固定框架

开机进入 FT 页后，屏幕固定分区如下：

- 顶部：`FT测试` + 进度（如 `1/7`）+ 总状态（`WAIT/RUN/PASS/FAIL`）
- 左列 7 行步骤：`RF / 音频 / RTC / 充电 / LED / 按键 / NFC`
- 右侧内容区：`title`、`hint`、`detail1~detail4`
- 底部 footer：操作提示

### 2.2 第一批可见文案（流程刚启动）

工厂测试流程 `StartFlow()` 重置快照后，首个稳定可见内容为：

- `title`: `RF 测试`
- `hint`: `准备开始FT测试`
- 顶部进度：`1/7`
- 顶部状态：`WAIT`（随后会切到 `RUN`）
- `detail1~detail4`: 初始为空
- `footer`: 初始为空

## 3. 测试进行中：每一步屏幕显示什么

> 注：每个步骤先显示 `RUN`，通过后显示 `PASS`，失败显示 `FAIL` 并进入关机提示。

### 3.1 RF 测试

- `title`: `RF 测试`
- `hint`: `正在扫描目标 Wi-Fi`（通过后会变为 `RF 测试通过`）
- `detail1`: `SSID=Yoxintech`
- `detail2`: `RSSI=... dBm` 或 `RSSI=NOT_FOUND`
- `detail3`: `连续命中=x/3`
- `detail4`: `阈值=-70 dBm`

### 3.2 音频测试

- `title`: `音频测试`
- `hint`: `正在播放/录音/解码`（通过后 `音频测试通过`）
- `detail1`: `状态=PASS/FAIL`
- `detail2`: `round=... fc=...`
- `detail3`: `reason=...`
- `detail4`: 空

### 3.3 RTC 测试

- `title`: `RTC 测试`
- `hint`: `校验 RTC 走时和 5 秒触发`
- 常见细节行：
- `detail1`: `SET=08:00:00` 或 `RTC=NOT_FOUND`
- `detail2`: `NOW=HH:MM:SS` / `NOW=--:--:--` / `NOW=READ_FAIL`
- `detail3`: `INT=HIT/WAIT TF=0/1`
- `detail4`: `elapsed=n/5s`

失败场景会显示：

- `hint`: `RTC 读回失败` / `RTC 时间未走到 08:00:05` / `RTC 5 秒触发超时`

### 3.4 充电测试

- `title`: `充电测试`
- `hint`: `请插入 USB`（通过后 `充电测试通过`）
- `detail1`: `USB=IN/OUT`
- `detail2`: `CHG=0/1 FULL=0/1`
- `detail3`: `BAT=xx%` 或 `BAT=--`
- `detail4`: 可能显示 `未检测到电池` / `满电信号有效但电量不足`

### 3.5 LED 测试

- `title`: `LED 测试`
- `hint`: `LED 1 秒闪烁，请目视确认`（通过后 `LED 测试通过`）
- `detail1`: `GPIO3 正在 1 秒闪烁`
- `detail2`: `确认键通过，下键失败`
- `detail3~4`: 空

### 3.6 按键测试

- `title`: `按键测试`
- `hint`: `请依次按下：确认 / 上 / 下`（通过后 `按键测试通过`）
- `detail1~3` 使用前缀语法并在 UI 里转为视觉状态：
- `[>] xxx` 当前项（反色）
- `[x] xxx` 已完成（删除线）
- `[X] xxx` 失败项（显示 X）

按错键时会显示：

- `hint`: `按键顺序错误，正在重新开始`
- `footer`: `请重新开始按键测试`
- `detail4`: `按错键后自动重新开始`

### 3.7 NFC 测试

- `title`: `NFC 测试`
- `hint`: `正在写入 NFC 测试链接`（通过后 `NFC 测试通过`）
- `detail1`: `URL=https://www.zectrix.com`
- `detail2`: `WRITE=... RAW=... NDEF=...` 或 `写入校验=PASS`
- `detail3`: `校验=PASS/FAIL attempt=x/3` 或 `FD=... 场=... idle/read=x/3`
- `detail4`: `RAW=...B NDEF=...B` / `请保持手机远离 NFC 天线` / `请用手机靠近并读取 NFC`

## 4. 测试完成页（最终画面）

全部通过后会显示：

- `title`: `全部通过`
- `hint`: `所有测试均通过，准备关机`
- `detail1`: `请拔掉 USB`
- `detail2`: 初始 `USB=IN`，轮询更新为 `USB=OUT`
- `detail3`: `拔掉后按确认键关机`
- `detail4`: `请先拔掉 USB` 或 `确认键单击后关机`
- `footer`: `全部通过，请拔掉 USB 后按确认`

若 USB 未拔出就按确认，会提示：

- `hint`: `请先拔掉 USB，再按确认`
- `footer`: `USB 未拔出，不能关机`

## 5. 待机界面现状（你关心的点）

- 当前 UI 只有 `FactoryTest` 一个页面 ID。
- 没有单独“待机界面”可切换。
- 当前工程里的“待机”只体现为电源管理逻辑代码骨架，不会出现新的待机页面画面。

