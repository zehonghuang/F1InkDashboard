# zectrix-s3-epaper-4.2 引脚/端口表（固件定义）

本文档根据固件源码整理 `zectrix-s3-epaper-4.2` 这块 PCB 在工程中实际使用到的 GPIO 与总线端口映射。

数据来源：
- 板级宏定义：[config.h](file:///c:/Users/GinTonic/Desktop/zectrix/main/boards/zectrix-s3-epaper-4.2/config.h)
- 外设绑定/初始化：[zectrix-s3-epaper-4.2.cc](file:///c:/Users/GinTonic/Desktop/zectrix/main/boards/zectrix-s3-epaper-4.2/zectrix-s3-epaper-4.2.cc)
- 板载 LED（硬编码）：[board_power_bsp.cc](file:///c:/Users/GinTonic/Desktop/zectrix/main/boards/zectrix-s3-epaper-4.2/board_power_bsp.cc)

> 说明：本文只覆盖“固件用到的引脚/端口”。如果你需要“PCB 全部焊盘/排针”级别的引脚表，需要结合原理图/PCB 标注进一步补齐。

## 总线端口一览

| 功能 | 端口/Host | 备注 | 代码位置 |
|---|---:|---|---|
| I2C 主总线 | `i2c_port = 0`（I2C0） | 供音频 Codec、RTC、NFC 共用 | [InitializeI2c](file:///c:/Users/GinTonic/Desktop/zectrix/main/boards/zectrix-s3-epaper-4.2/zectrix-s3-epaper-4.2.cc#L363-L377) |
| EPD SPI | `SPI3_HOST` | ePaper 屏 SPI 主机 | [config.h](file:///c:/Users/GinTonic/Desktop/zectrix/main/boards/zectrix-s3-epaper-4.2/config.h#L44-L52) |
| VBAT ADC | `ADC_UNIT_1 + ADC_CHANNEL_3` | SoC 固定映射；工程未单独定义 VBAT ADC GPIO 宏 | [ReadBatteryVoltage](file:///c:/Users/GinTonic/Desktop/zectrix/main/boards/zectrix-s3-epaper-4.2/zectrix-s3-epaper-4.2.cc#L600-L638) |

## 引脚总表（宏/用途 -> GPIO）

| 子系统 | 信号 | 宏/字段 | GPIO | 备注 | 代码位置 |
|---|---|---|---:|---|---|
| 音频 I2S | MCLK | `AUDIO_I2S_GPIO_MCLK` | 14 |  | [config.h](file:///c:/Users/GinTonic/Desktop/zectrix/main/boards/zectrix-s3-epaper-4.2/config.h#L9-L13) |
| 音频 I2S | BCLK | `AUDIO_I2S_GPIO_BCLK` | 15 |  | [config.h](file:///c:/Users/GinTonic/Desktop/zectrix/main/boards/zectrix-s3-epaper-4.2/config.h#L9-L13) |
| 音频 I2S | DIN | `AUDIO_I2S_GPIO_DIN` | 16 |  | [config.h](file:///c:/Users/GinTonic/Desktop/zectrix/main/boards/zectrix-s3-epaper-4.2/config.h#L9-L13) |
| 音频 I2S | DOUT | `AUDIO_I2S_GPIO_DOUT` | 45 |  | [config.h](file:///c:/Users/GinTonic/Desktop/zectrix/main/boards/zectrix-s3-epaper-4.2/config.h#L9-L13) |
| 音频 I2S | WS/LRCK | `AUDIO_I2S_GPIO_WS` | 38 |  | [config.h](file:///c:/Users/GinTonic/Desktop/zectrix/main/boards/zectrix-s3-epaper-4.2/config.h#L9-L13) |
| 音频 Codec（I2C0） | SDA | `AUDIO_CODEC_I2C_SDA_PIN` | 47 | I2C0 SDA | [config.h](file:///c:/Users/GinTonic/Desktop/zectrix/main/boards/zectrix-s3-epaper-4.2/config.h#L15-L18) |
| 音频 Codec（I2C0） | SCL | `AUDIO_CODEC_I2C_SCL_PIN` | 48 | I2C0 SCL | [config.h](file:///c:/Users/GinTonic/Desktop/zectrix/main/boards/zectrix-s3-epaper-4.2/config.h#L15-L18) |
| 音频功放/PA | EN/PA | `AUDIO_CODEC_PA_PIN` | 46 | 与 `Audio_AMP_PIN` 复用同一 GPIO | [config.h](file:///c:/Users/GinTonic/Desktop/zectrix/main/boards/zectrix-s3-epaper-4.2/config.h#L15-L18) |
| 按键 | CONFIRM/BOOT | `BOOT_BUTTON_GPIO` | 0 | 作为 confirm 键使用 | [config.h](file:///c:/Users/GinTonic/Desktop/zectrix/main/boards/zectrix-s3-epaper-4.2/config.h#L20-L27) |
| 按键 | UP | `TODO_UP_BUTTON_GPIO` | 39 |  | [config.h](file:///c:/Users/GinTonic/Desktop/zectrix/main/boards/zectrix-s3-epaper-4.2/config.h#L23-L27) |
| 按键 | DOWN | `TODO_DOWN_BUTTON_GPIO` | 18 | 与 `VBAT_PWR_GPIO` 复用 | [config.h](file:///c:/Users/GinTonic/Desktop/zectrix/main/boards/zectrix-s3-epaper-4.2/config.h#L23-L27) |
| 电源键检测/复用 | PWR KEY SENSE | `VBAT_PWR_GPIO` | 18 | 注释标明“开机电源键与下键复用”；`InitializePower` 中轮询该电平 | [config.h](file:///c:/Users/GinTonic/Desktop/zectrix/main/boards/zectrix-s3-epaper-4.2/config.h#L23-L27)、[InitializePower](file:///c:/Users/GinTonic/Desktop/zectrix/main/boards/zectrix-s3-epaper-4.2/zectrix-s3-epaper-4.2.cc#L349-L361) |
| 充电检测 | CHG_DET | `CHARGE_DETECT_GPIO` | 2 | `CHARGE_DETECT_CHARGING_LEVEL=0` 表示低电平=充电中 | [config.h](file:///c:/Users/GinTonic/Desktop/zectrix/main/boards/zectrix-s3-epaper-4.2/config.h#L28-L33) |
| 充电满 | CHG_FULL | `CHARGE_FULL_GPIO` | 1 |  | [config.h](file:///c:/Users/GinTonic/Desktop/zectrix/main/boards/zectrix-s3-epaper-4.2/config.h#L28-L33) |
| RTC（PCF8563，I2C0） | INT | `RTC_INT_GPIO` | 5 | 外部中断脚 | [config.h](file:///c:/Users/GinTonic/Desktop/zectrix/main/boards/zectrix-s3-epaper-4.2/config.h#L35-L37) |
| NFC（I2C0） | PWR | `NFC_PWR_GPIO` | 21 | NFC 供电控制 | [config.h](file:///c:/Users/GinTonic/Desktop/zectrix/main/boards/zectrix-s3-epaper-4.2/config.h#L39-L43) |
| NFC（I2C0） | FD | `NFC_FD_GPIO` | 7 | `NFC_FD_ACTIVE_LEVEL=0` | [config.h](file:///c:/Users/GinTonic/Desktop/zectrix/main/boards/zectrix-s3-epaper-4.2/config.h#L39-L43) |
| EPD（SPI3） | RST | `EPD_RST_PIN` | 9 |  | [config.h](file:///c:/Users/GinTonic/Desktop/zectrix/main/boards/zectrix-s3-epaper-4.2/config.h#L47-L52) |
| EPD（SPI3） | DC | `EPD_DC_PIN` | 10 |  | [config.h](file:///c:/Users/GinTonic/Desktop/zectrix/main/boards/zectrix-s3-epaper-4.2/config.h#L47-L52) |
| EPD（SPI3） | CS | `EPD_CS_PIN` | 11 |  | [config.h](file:///c:/Users/GinTonic/Desktop/zectrix/main/boards/zectrix-s3-epaper-4.2/config.h#L47-L52) |
| EPD（SPI3） | SCK | `EPD_SCK_PIN` | 12 |  | [config.h](file:///c:/Users/GinTonic/Desktop/zectrix/main/boards/zectrix-s3-epaper-4.2/config.h#L47-L52) |
| EPD（SPI3） | MOSI | `EPD_MOSI_PIN` | 13 |  | [config.h](file:///c:/Users/GinTonic/Desktop/zectrix/main/boards/zectrix-s3-epaper-4.2/config.h#L47-L52) |
| EPD | BUSY | `EPD_BUSY_PIN` | 8 |  | [config.h](file:///c:/Users/GinTonic/Desktop/zectrix/main/boards/zectrix-s3-epaper-4.2/config.h#L47-L52) |
| EPD 电源 | PWR_EN | `EPD_PWR_PIN` | 6 | ePaper 供电开关 | [config.h](file:///c:/Users/GinTonic/Desktop/zectrix/main/boards/zectrix-s3-epaper-4.2/config.h#L57-L62) |
| 音频电源 | PWR_EN | `Audio_PWR_PIN` | 42 | 音频供电开关 | [config.h](file:///c:/Users/GinTonic/Desktop/zectrix/main/boards/zectrix-s3-epaper-4.2/config.h#L57-L62) |
| 音频功放 | AMP_EN | `Audio_AMP_PIN` | 46 | 与 `AUDIO_CODEC_PA_PIN` 同 GPIO | [config.h](file:///c:/Users/GinTonic/Desktop/zectrix/main/boards/zectrix-s3-epaper-4.2/config.h#L57-L62) |
| VBAT 电源 | VBAT_EN | `VBAT_PWR_PIN` | 17 | 电池/系统电源控制 | [config.h](file:///c:/Users/GinTonic/Desktop/zectrix/main/boards/zectrix-s3-epaper-4.2/config.h#L57-L62) |
| 板载 LED | LED | （硬编码） | 3 | Factory/Power LED（由充电状态驱动） | [board_power_bsp.cc](file:///c:/Users/GinTonic/Desktop/zectrix/main/boards/zectrix-s3-epaper-4.2/board_power_bsp.cc#L7-L55) |

## I2C 设备地址（I2C0）

| 设备 | 地址 | 备注 | 代码位置 |
|---|---:|---|---|
| 音频 Codec ES8311 | `AUDIO_CODEC_ES8311_ADDR` | 默认地址宏 `ES8311_CODEC_DEFAULT_ADDR` | [config.h](file:///c:/Users/GinTonic/Desktop/zectrix/main/boards/zectrix-s3-epaper-4.2/config.h#L15-L18) |
| RTC PCF8563 | `0x51` | `RTC_I2C_ADDR` | [config.h](file:///c:/Users/GinTonic/Desktop/zectrix/main/boards/zectrix-s3-epaper-4.2/config.h#L35-L37) |
| NFC GT23SC6699 | `0x55` | `NFC_I2C_ADDR` | [config.h](file:///c:/Users/GinTonic/Desktop/zectrix/main/boards/zectrix-s3-epaper-4.2/config.h#L39-L43) |

## EPD SPI 引脚打包结构（用于驱动层）

EPD 的 SPI/GPIO 映射在初始化时被写入 `custom_lcd_spi_t`，字段定义见 [custom_lcd_display.h](file:///c:/Users/GinTonic/Desktop/zectrix/main/boards/zectrix-s3-epaper-4.2/custom_lcd_display.h#L25-L35)，赋值见 [InitializeLcdDisplay](file:///c:/Users/GinTonic/Desktop/zectrix/main/boards/zectrix-s3-epaper-4.2/zectrix-s3-epaper-4.2.cc#L402-L423)：

| 字段 | 含义 | GPIO/值 |
|---|---|---|
| `cs` | SPI CS | `EPD_CS_PIN` = GPIO11 |
| `dc` | 数据/命令 | `EPD_DC_PIN` = GPIO10 |
| `rst` | 复位 | `EPD_RST_PIN` = GPIO9 |
| `busy` | Busy | `EPD_BUSY_PIN` = GPIO8 |
| `mosi` | SPI MOSI | `EPD_MOSI_PIN` = GPIO13 |
| `scl` | SPI SCK | `EPD_SCK_PIN` = GPIO12 |
| `power` | 供电控制 | `EPD_PWR_PIN` = GPIO6 |
| `spi_host` | SPI Host | `EPD_SPI_NUM` = `SPI3_HOST` |

## 复用/冲突点（需要硬件侧确认）

| GPIO | 复用对象 | 代码证据 |
|---:|---|---|
| 18 | `TODO_DOWN_BUTTON_GPIO` 与 `VBAT_PWR_GPIO` | [config.h](file:///c:/Users/GinTonic/Desktop/zectrix/main/boards/zectrix-s3-epaper-4.2/config.h#L23-L27)、[InitializePower](file:///c:/Users/GinTonic/Desktop/zectrix/main/boards/zectrix-s3-epaper-4.2/zectrix-s3-epaper-4.2.cc#L349-L361) |
| 46 | `AUDIO_CODEC_PA_PIN` 与 `Audio_AMP_PIN` | [config.h](file:///c:/Users/GinTonic/Desktop/zectrix/main/boards/zectrix-s3-epaper-4.2/config.h#L15-L18)、[config.h](file:///c:/Users/GinTonic/Desktop/zectrix/main/boards/zectrix-s3-epaper-4.2/config.h#L57-L62) |

