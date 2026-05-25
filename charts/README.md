# charts

前端 dashboard（x 轴=lap1..lapN），数据来自后端 MySQL 表 `openf1_laps`。

支持选择 Lap 范围：全部 / 前 1/3 / 中 1/3 / 后 1/3。

图表：
- Lap Times（Lap/S1/S2/S3）
- Speeds（ST/I1/I2）
- Throttle/Brake（选中某一圈，x=该圈内时间 t(s)）

## 后端

后端需要开启 MySQL，并且已经同步过 OpenF1 laps 数据。

API：
- `GET /api/v1/telemetry/laps/available`
- `GET /api/v1/telemetry/laps?driver_number=63&session_key=9161`
- `GET /api/v1/telemetry/lap_trace?driver_number=63&session_key=9161&lap_number=8`
- `GET /api/v1/telemetry/lap_time_boxplot?session_key=9161&driver_numbers=63,44,1`

## Python 批量渲染 PNG

会把每一圈的 throttle/brake trace 渲染成 PNG（黑实线=throttle，灰虚线=brake）。

```bash
cd backend
.\.venv\Scripts\python.exe scripts/render_lap_traces_png.py --driver-number 63 --session-key 9161
```

## 前端启动

```bash
cd charts
npm i
npm run dev
```

默认后端地址是 `http://127.0.0.1:8008`。

如果你的后端不是这个端口：

```bash
cd charts
set VITE_API_BASE=http://127.0.0.1:8008
npm run dev
```
