# InfluxDB + OpenF1 car_data

## 启动 InfluxDB（Docker）

1) 从 `.env.example` 复制一份 `.env`，并修改 InfluxDB 的参数（尤其是 `INFLUXDB_PASSWORD` / `INFLUXDB_TOKEN`）。

2) 启动：

```bash
docker compose -f docker-compose.influxdb.yml up -d
```

InfluxDB UI：
- http://localhost:8086/

## 拉取 OpenF1 car_data 并写入 InfluxDB

注意：脚本内置限速，满足：
- 每秒最多 3 个请求
- 每分钟最多 30 个请求（实际按 2s 一次请求）

示例（写入某个车手的 car_data）：

```bash
python backend/scripts/openf1_car_data_to_influx.py --driver-number 55
```

可选参数：
- `--session-key latest`
- `--meeting-key latest`
- `--poll-interval-s 2.0`
- `--max-batch 256`
- `--influx-url http://localhost:8086`
- `--influx-org toinc_F1`
- `--influx-bucket openf1`
- `--influx-token changeme`

## 数据模型

measurement:
- `car_data`

tags:
- `driver_number`
- `session_key`
- `meeting_key`

fields:
- `speed` (km/h)
- `throttle` (%)
- `brake` (0/100)
- `rpm`
- `n_gear`
- `drs`
