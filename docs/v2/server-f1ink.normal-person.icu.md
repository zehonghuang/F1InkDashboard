# 服务器梳理：f1ink.normal-person.icu (54.46.73.11)

> ⚠️ **本文档已不再作为迁移基准。迁移部署请使用：[production-deployment-guide.md](file:///c:/F1InkDashboard/docs/v2/production-deployment-guide.md)（可迁移通用版，所有实例绑定信息已替换为占位符）。**
>
> 本文件仅作为 **2026-08-07 该台 EC2 特定实例状态的历史快照**，用于事故回查 / 该实例的运维参考，不能直接复制用于新实例。

> 采集时间：2026-08-07T08:06Z (UTC)
> 用途：F1InkDashboard 生产部署（Admin 后台 / Charts 图表 / Backend API + MySQL）
> 登录方式：`ssh -i "C:\Users\Toinic Huang\Downloads\prd-eks-key.pem" ec2-user@54.46.73.11`

---

## 1. 服务器基本信息

| 项 | 值 |
|---|---|
| **公网 IP** | `54.46.73.11` |
| **主域名** | `f1ink.normal-person.icu` (CNAME/A → 54.46.73.11，Cloudflare DNS) |
| **内网主机名** | `ip-172-31-0-46.ap-east-1.compute.internal` |
| **区域** | AWS `ap-east-1`（香港） |
| **操作系统** | Amazon Linux 2023（Fedora 系） |
| **内核** | `6.18.39-79.141.amzn2023.x86_64` |
| **CPU** | 4 vCPU × AMD EPYC 7R32 (2 核 / 插座，2 线程 / 核) |
| **内存** | **7.6 GiB**（当时占用 5.1G 已用 / 1.7G 可用，无 swap） |
| **系统盘** | `/dev/nvme0n1p1` 50G → 45G 可用（11%） |
| **数据盘** | `/dev/nvme1n1` 295G 挂载 `/mnt/data` → 228G 可用（19%），在 `/etc/fstab` 中持久化挂载 |
| **SSH 端口** | `22`（0.0.0.0 + [::]） |
| **登录用户** | `ec2-user`（已加入 docker 组，无需 sudo 操作 docker） |
| **安全更新** | MOTD 提示有 2 条 Important Security notice，可用 `sudo dnf update` 安装 |

### 已安装工具版本

| 工具 | 版本 |
|---|---|
| Docker Engine（server） | `25.0.16` |
| Docker CLI（client） | `25.0.14` |
| Docker Compose Plugin（v2） | `v5.4.0`（`docker-compose` 也能用，是兼容 symlink/plugin） |
| GitHub CLI (`gh`) | `2.97.0`（**当前未登录**，登录后 deploy.sh 会优先用 gh 拉代码） |
| acme.sh | 最新版（`~/.acme.sh/`，CA 账户邮箱 `admin@normal-person.icu`） |
| Git | `2.50.1` |
| OpenSSL | 系统自带 |

---

## 2. 对外访问入口（HTTPS，已签发 Let's Encrypt ECC 证书）

| 入口 | URL | 说明 |
|---|---|---|
| **Admin 管理后台** | https://f1ink.normal-person.icu/ | Nginx 根路径 → `admin:80` |
| **Charts 遥测图表** | https://f1ink.normal-person.icu/charts/ | `/charts*` → `charts:80` |
| **Backend API Base** | https://f1ink.normal-person.icu/api/... | `/api*` → `backend:8008` |
| **Swagger API 文档** | https://f1ink.normal-person.icu/swagger/index.html | `/swagger*` → `backend:8008` |
| **静态资源 (static/docs)** | https://f1ink.normal-person.icu/static/ & /docs/ | → backend 直接提供 |
| **WebSocket (F1 Live)** | `wss://f1ink.normal-person.icu/ws` 和 `/ws/` | 带 Upgrade/Connection，3600s 超时 |
| HTTP → HTTPS 跳转 | `http://f1ink.normal-person.icu/*`（`/.well-known/acme-challenge/` 除外） | **301 Moved Permanently** + 追加 HSTS header（max-age=1y includeSubDomains） |

### 微信小程序相关（记得同步！）
- 服务器白名单（小程序后台 → 开发设置）：
  - **request 合法域名**：`https://f1ink.normal-person.icu`（去掉旧的 `winpc-f1...`）
  - **socket 合法域名**：`wss://f1ink.normal-person.icu`
- 对应代码改动：`miniprogram/app.js` L16 的 `defaultApiBase` 已改为新域名（`https://f1ink.normal-person.icu`），改一处即可，WSS 会自动由 `toWsBaseUrl()` 转换。

---

## 3. 部署架构总览

```
                    0.0.0.0:80  +  0.0.0.0:443
                 ┌─────────────────────────────────┐
                 │  f1ink-nginx-gateway           │
                 │  (nginx:1.27-alpine, bridge)  │
                 └───────────────┬─────────────────┘
                                 │ 路径分流 (default.conf)
          ┌──────────────────────┼───────────────────────┐
          ▼                      ▼                       ▼
   /                     /charts/               /api|/swagger|/ws|/static|/docs
┌──────────┐        ┌────────────┐         ┌──────────────────┐
│ admin    │        │ charts     │         │ backend          │
│ :80 (expose only)│ :80 (expose only) │  :8008 (expose only) │
│ nginx+served SPA │ nginx+served SPA │  Go (binary ./backend)│
└────┬─────┘        └─────┬──────┘         └────────┬─────────┘
     │                    │                           │ MySQL
     └────────────────────┴─────────────────┐         │ 宿主机 bridge IP
                                            ▼         ▼
                                ┌────────────────────────────┐
                                │ toinc-f1-mysql             │
                                │ mysql:8.0  (宿主机容器)   │
                                │ 0.0.0.0:3306 → 3306/tcp  │
                                │ 数据库：toinc_F1          │
                                └────────────────────────────┘
```

- 4 个 F1 应用容器由 `/opt/f1ink/docker-compose.yml` 管理，共用自定义 bridge `f1ink-net`。
- MySQL **不由 compose 管理**，是更早单独 `deploy_mysql_ec2.sh` 起的宿主机 `--name toinc-f1-mysql`，监听 0.0.0.0:3306；compose 内的 backend 通过 `172.17.0.1:3306`（docker0 宿主机侧网关）访问它。

### 当时资源占用快照（2026-08-07 ~08:06Z）

| 容器 | CPU | 内存 | 内存占比 | PIDs | NET I/O (累计) |
|---|---|---|---|---|---|
| `f1ink-nginx-gateway` | 0.00% | 5.5 MiB / 7.6 GiB | 0.07% | 5 | 1.7 MB / 1.9 MB |
| `f1ink-admin` | 0.00% | 4.4 MiB | 0.06% | 5 | 17.7 kB / 665 kB |
| `f1ink-charts` | 0.00% | 4.2 MiB | 0.05% | 5 | 2.07 kB / 0 B |
| `f1ink-backend` | 0.09% | 18.8 MiB | 0.24% | 6 | 676 kB / 1.1 MB |
| `toinc-f1-mysql` | 0.25% | **4.6 GiB** | **60.55%** | 42 | 373 kB / 909 kB |

> ⚠️ MySQL 一个人占 60% 内存（InnoDB buffer pool 较大），总可用内存 1.7G，暂不会 OOM 但扩容前要留意。

---

## 4. 服务器监听端口（来自 ss -tlnp）

| 端口 | 绑定地址 | 对应进程/用途 |
|---|---|---|
| **80** | `0.0.0.0` + `[::]` | `nginx-gateway` 容器（HTTP → HTTPS 301 跳转 / .well-known） |
| **443** | `0.0.0.0` + `[::]` | `nginx-gateway` 容器（HTTPS，对外唯一入口） |
| **3306** | `0.0.0.0` | `toinc-f1-mysql` 容器（MySQL） |
| **22** | `0.0.0.0` + `[::]` | sshd |
| `33851` | `127.0.0.1` only | docker 内部 RPC，对外不可达 |

> compose 里 backend/admin/charts 只做了 `expose:`，没有 `ports:`，所以它们在宿主机上**不直接暴露端口**，必须经由 nginx-gateway 容器的 80/443 进入。符合「只通过 Nginx 网关」的设计。

---

## 5. 部署目录结构 (`/opt/f1ink`)

```
/opt/f1ink/
├── deploy.sh                 ← 【最重要】一键拉代码 + build + up + 冒烟测试的脚本
├── reload-nginx.sh           ← acme.sh 续期证书后重启 nginx-gateway 的钩子
├── docker-compose.yml        ← 4 服务编排（backend/admin/charts/nginx-gateway + f1ink-net）
├── .env                      ← 所有环境变量（DB 连接、Token、GitHub 仓库/分支）
├── logs/
│   ├── deploy.log / deploy.pid  ← deploy.sh 运行时日志（需要的话再加；当前目录存在）
│   └── nginx/
│       ├── access.log        ← nginx-gateway 访问日志（容器内 /var/log/nginx 绑定出来）
│       └── error.log         ← nginx-gateway 错误日志
├── nginx/
│   ├── conf.d/
│   │   └── default.conf      ← 路径分流 + HTTP→HTTPS 跳转 + TLS/HSTS 配置
│   └── ssl/                  ← acme.sh --install-cert 写入的证书（容器挂载 /etc/nginx/ssl）
│       ├── fullchain.pem     ← 含中间证书链（Let's Encrypt YE1）
│       └── privkey.pem       ← ECC 私钥 (ec-256)
├── ssl/                      ← 目录存在，当前未用（nginx/ssl/ 才是真挂载点）
└── src/                      ← 每次 deploy.sh 拉取的代码副本（作为 docker build 的 context）
    ├── backend/   (Dockerfile + Go 源码)
    ├── admin/     (Dockerfile + Vue/TS + nginx.conf)
    ├── charts/    (Dockerfile + Vue/JS + nginx.conf)
    └── 其他仓库内容（miniprogram、main、scripts、docs …… build context 仅取对应子目录）
```

---

## 6. docker-compose.yml（/opt/f1ink/docker-compose.yml）

```yaml
services:
  backend:   build: ./src/backend,  listen :8008,  env 全部从 .env 透传, restart: unless-stopped
  admin:     build: ./src/admin,    expose :80,   build arg ADMIN_VITE_API_BASE,  depends_on backend
  charts:    build: ./src/charts,   expose :80,   build arg CHARTS_VITE_API_BASE, depends_on backend
  nginx-gateway: image nginx:1.27-alpine, ports 80:80 + 443:443,
                 volumes: ./nginx/conf.d, ./nginx/ssl, ./logs/nginx
                 depends_on: backend/admin/charts, restart: unless-stopped
networks:
  f1ink-net: bridge
```

### .env 内容（**敏感值已 MASK，真实值以服务器为准**）

```bash
# ── Backend 基础 ──────────────────────────────────────────────
BACKEND_LISTEN_ADDR=:8008
BACKEND_STATIC_DIR=./static
BACKEND_UPDATE_DIR=./static/update
BACKEND_TRUSTED_PROXIES=all
BACKEND_LOG_REQUESTS=1
BACKEND_REQUIRE_MYSQL=1
BACKEND_ADMIN_TOKEN=***MASKED***

# ── MySQL（宿主机 toinc-f1-mysql 容器，172.17.0.1:3306） ──
TOINC_F1_MYSQL_ENABLED=1
TOINC_F1_MYSQL_HOST=172.17.0.1
TOINC_F1_MYSQL_PORT=3306
TOINC_F1_MYSQL_USER=root
TOINC_F1_MYSQL_PASSWORD=***MASKED***
TOINC_F1_MYSQL_DB=toinc_F1
TOINC_F1_MYSQL_CHARSET=utf8mb4

# ── 功能开关（默认没开，按需改成 1） ────────────────────────
WECHAT_MINI_ENABLED=0
WECHATPAY_ENABLED=0
NEWS_WS_ENABLED=0
OPENF1_ENABLED=0
OPENF1_SCHEDULER_ENABLED=0
MP_NEWS_SCHEDULER_ENABLED=0

# ── Admin/Charts 构建时注入的 VITE_API_BASE（留空 = 同源） ─
ADMIN_VITE_API_BASE=
CHARTS_VITE_API_BASE=

# ── 部署参数（deploy.sh 读） ────────────────────────────────
GITHUB_REPO=zehonghuang/F1InkDashboard
GITHUB_BRANCH=main
```

> 💡 切分支/切仓库只改 `.env` 里 `GITHUB_BRANCH` / `GITHUB_REPO` 然后 `./deploy.sh` 即可。

---

## 7. Nginx 网关路径分流表

来自 `/opt/f1ink/nginx/conf.d/default.conf`：

| 匹配路径（443 server） | upstream | 特殊配置 |
|---|---|---|
| `/api/*` | `backend:8008` | `proxy_read_timeout 300s`（慢查询/大数据） |
| `/swagger/*` | `backend:8008` | |
| `/static/*` | `backend:8008` | |
| `/docs/*` | `backend:8008` | |
| `/ws` & `/ws/*` | `backend:8008` | **Upgrade + Connection upgrade**，`proxy_read/write_timeout 3600s`（长连接） |
| `/charts` & `/charts/*` | `charts:80` | Nginx SPA 容器 |
| `/`（其余所有） | `admin:80` | Nginx SPA 容器（根路径兜底） |

- **80 server**：`/.well-known/acme-challenge/` 静态目录（方便未来 HTTP-01），其他所有请求 **301 → https://$host$request_uri**。
- **443 server**：`http2 on; ssl_protocols TLSv1.2 TLSv1.3; ssl_prefer_server_ciphers on; ssl_session_cache shared:SSL:10m;` 已配；`add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;` 全局 HSTS；`client_max_body_size 50M;`

---

## 8. HTTPS 证书 + 自动续期（acme.sh + Cloudflare DNS-01）

| 项 | 值 |
|---|---|
| **域名** | `f1ink.normal-person.icu`（单域名，无 SAN） |
| **证书类型** | Let's Encrypt ECC（`KeyLength=ec-256`） |
| **签发者** | Let's Encrypt / `CN=YE1` |
| **notBefore** | `2026-08-07 05:45:20 GMT` |
| **notAfter** | `2026-11-05 05:45:19 GMT`（90 天） |
| **acme.sh 建议下次 renew** | `2026-10-06` 左右（`--cron` 到期自动续） |
| **挑战方式** | **Cloudflare DNS-01**（acme.sh `--dns dns_cf`，不需要对公网 80 暴露路径验证） |
| **Cloudflare Token** | 保存在 `~/.acme.sh/account.conf` → `SAVED_CF_Token=***MASKED***`（acme.sh install 时从 `$CF_Token` 固化到账户配置），所以即使 shell 没有 `$CF_Token`，`acme.sh --cron` 也能续 |
| **证书部署后钩子（install-cert）** | 把 fullchain+key 写入 `/opt/f1ink/nginx/ssl/` 后，`--reloadcmd "/opt/f1ink/reload-nginx.sh"` → `cd /opt/f1ink && docker-compose restart nginx-gateway`，日志追加到 `/tmp/nginx-reload.log` |
| **Cron 定时** | `ec2-user` crontab：`41 0,6,12,18 * * *`（每天 4 次，41 分跑）`acme.sh --cron`，标准输出丢弃，错误会记录在 `~/.acme.sh/acme.sh.log` |

### 手动验证 / 强制续期（一般不需要）
```bash
# 证书到期日
openssl x509 -in /opt/f1ink/nginx/ssl/fullchain.pem -noout -dates -subject -issuer
# 强制续期（到窗口前一般会返回 Skip，用 --force 也行，但会消耗签发额度）
~/.acme.sh/acme.sh --renew -d f1ink.normal-person.icu --dns dns_cf --force
```

---

## 9. 一键部署（`/opt/f1ink/deploy.sh`）工作流程

**推荐使用方式（在你本机 PowerShell 一行）**：
```powershell
$pem = "C:\Users\Toinic Huang\Downloads\prd-eks-key.pem"
ssh -i $pem ec2-user@54.46.73.11 'cd /opt/f1ink && ./deploy.sh'
```

脚本做了什么：
1. **前置检查**：`docker` + `docker-compose` / `docker compose` 是否可用；不可用则自动尝试加 `sudo`。
2. **加载 `.env`**（`set -a; source .env; set +a`）→ 拿到 `GITHUB_REPO` / `GITHUB_BRANCH`。
3. **拉代码**：
   - 优先尝试 `fetch_via_gh`：要求 `gh` 可执行 **且 `gh auth status` 通过**（当前服务器 gh **未登录**，所以跳过此分支）。
   - 否则自动 `fetch_via_git`：HTTPS 拉取 `https://github.com/<repo>.git`，已有 `src/.git` 就 reset --hard 到 `origin/<branch>`，没有就 `git clone --branch <branch> --single-branch`。
   - ✅ 两种方式都能工作，公开仓库不依赖 gh 登录。
4. **检查 Dockerfile**：`src/backend/Dockerfile`、`src/admin/Dockerfile`、`src/charts/Dockerfile` 必须齐全。
5. **停旧容器** `docker-compose down --remove-orphans` → **build** → **up -d**。
6. **等待 8s** → 打印 `docker-compose ps` + backend 最近 20 行日志。
7. **Gateway 冒烟测试**：最多 6 次 `curl 127.0.0.1:80/api/v1/f1/session-meta?season=2025`，期望 HTTP 2xx/3xx/4xx（<500）通过。
8. 打印部署完成 banner + 常用运维命令。

> 如果 gh 没登录但想走 gh（比如以后变私有仓库，或 API rate 被限）：在 EC2 上 `gh auth login` 一次就行，之后 deploy.sh 自动切回 gh 分支。

---

## 10. 常用运维命令（本机 PowerShell 一行直达）

```powershell
$pem = "C:\Users\Toinic Huang\Downloads\prd-eks-key.pem"
$ip  = "ec2-user@54.46.73.11"

# 状态
ssh -i $pem $ip "cd /opt/f1ink; docker-compose ps"
ssh -i $pem $ip "docker ps -a"
ssh -i $pem $ip "docker stats --no-stream"   # 容器级 top 快照

# 容器级 top（持续刷新）
ssh -it -i $pem $ip "cd /opt/f1ink && docker stats"   # 交互式

# 某个容器里的进程列表（相当于 ps aux 在容器里）
ssh -i $pem $ip "docker top f1ink-backend"
ssh -i $pem $ip "docker top toinc-f1-mysql"

# 日志
ssh -i $pem $ip "cd /opt/f1ink; docker-compose logs -f --tail 100"
ssh -i $pem $ip "cd /opt/f1ink; docker-compose logs -f --tail 200 backend"
ssh -i $pem $ip "cd /opt/f1ink; docker-compose logs -f --tail 200 nginx-gateway"
ssh -i $pem $ip "docker logs -f --tail 200 toinc-f1-mysql"

# 进入容器 shell
ssh -it -i $pem $ip "docker exec -it f1ink-backend sh"
ssh -it -i $pem $ip "docker exec -it f1ink-nginx-gateway sh"
ssh -it -i $pem $ip "docker exec -it toinc-f1-mysql mysql -uroot -p"

# 重启
ssh -i $pem $ip "cd /opt/f1ink; docker-compose restart nginx-gateway"
ssh -i $pem $ip "cd /opt/f1ink; docker-compose restart backend"

# 停服务（慎重）
ssh -i $pem $ip "cd /opt/f1ink; docker-compose down"

# Nginx access/error 日志（宿主机直接读，因为挂载出来了）
ssh -i $pem $ip "tail -50 /opt/f1ink/logs/nginx/access.log"
ssh -i $pem $ip "tail -50 /opt/f1ink/logs/nginx/error.log"

# acme.sh 状态 / 手动 cron dry-run
ssh -i $pem $ip "~/.acme.sh/acme.sh --list"
ssh -i $pem $ip "cat ~/.acme.sh/acme.sh.log | tail -30"
ssh -i $pem $ip "crontab -l"
```

---

## 11. 遗留 & 注意事项

1. **gh 未登录**：`gh auth status` 显示未登录。当前 deploy.sh 能正常工作（因为公开仓库用 git HTTPS），但如果以后仓库变私有或要提高 API 额度，记得执行一次 `gh auth login`。
2. **MySQL 内存 4.6G / 60.55%**：如果后面加 `OPENF1_SCHEDULER_ENABLED=1`、`MP_NEWS_SCHEDULER_ENABLED=1` 跑后台任务，注意 MySQL 会不会被 OOM killer 干掉；必要时调整 MySQL 容器的 `--memory`/`--memory-swap` 或把 `innodb_buffer_pool_size` 降到 2~3G。
3. **微信小程序白名单**：`https://f1ink.normal-person.icu` 和 `wss://f1ink.normal-person.icu` 这两个新域名要加进小程序后台「服务器域名」，去掉旧的 `winpc-f1`。否则真机/体验版会报域名不合法（开发者工具勾选「不校验合法域名」可临时跳过）。
4. **Amazon Linux 2023 安全补丁**：MOTD 显示 2 条 Important Security notice。找个低峰期执行 `sudo dnf -y upgrade && (需要时 sudo reboot)` 即可。
5. **数据盘 `/mnt/data` 目前是空的？** 295G 只占了 19%（53G 用掉），可以考虑以后把 MySQL 数据目录、Nginx 日志归档放这里，避免 50G 系统盘被撑爆。
6. **deploy.sh 日志**：脚本目前没有标准的运行日志落盘（只在 stdout 打印）。如果想审计每次部署，可自行在脚本顶部加 `exec > >(tee -a "${SCRIPT_DIR}/logs/deploy.log") 2>&1`，并记录 start/stop pid。
7. **nginx ssl session cache / ARI**：当前配置够常规使用，如果追求 A+ 级 ssl lab 评分可再加 OCSP stapling；需要时另配。

---

**文档创建时间**：2026-08-07（部署当天）
**下次建议复查时间**：2026-10-01 前后（证书续期 cron 会自动跑，但人工确认一次 acme.sh 列表和 cron 更保险）。
