# F1InkDashboard 生产部署指南（可迁移通用版）

> 适用场景：在一台 Linux 实例上，用 **Docker Compose + Nginx 网关（80/443）+ Let's Encrypt 证书（acme.sh + Cloudflare DNS-01）** 部署 F1InkDashboard 的 `backend / admin / charts` 三个应用，并对接一个已存在的 MySQL。
>
> 迁移时，把文档里 `<...>` 占位符（见下方「迁移变量清单」）换成新实例的实际值即可，其余架构/步骤无需改动。

---

## 迁移变量清单（换实例时只改这里）

| 占位符 | 含义 | 示例 |
|---|---|---|
| `<USER>` | 目标实例的 SSH 登录用户 | `ec2-user`、`ubuntu`、`admin` |
| `<HOST>` | 目标实例公网 IP / 可达域名 | `54.46.73.11`、`server.example.com` |
| `<SSH_KEY_PATH>` | 你本地的 SSH 私钥路径（Windows） | `C:\Users\xxx\Downloads\xxx-key.pem` |
| `<DOMAIN>` | 对外服务域名（DNS A/CNAME → `<HOST>`） | `f1ink.normal-person.icu` |
| `<CF_EMAIL>` | Cloudflare 账户邮箱（acme.sh 注册用） | `admin@normal-person.icu` |
| `<CF_ZONE>` | `<DOMAIN>` 所在的 Cloudflare Zone（一般是二级域名） | `normal-person.icu` |
| `<GITHUB_REPO>` | 仓库 owner/repo（公开或 gh 已授权） | `zehonghuang/F1InkDashboard` |
| `<GITHUB_BRANCH>` | 要部署的分支 | `main`、`release/x.y.z` |
| `<MYSQL_HOST>` | backend 能访问到的 MySQL Host | `172.17.0.1`（docker0 宿主机网关） |
| `<MYSQL_PORT>` | MySQL 端口 | `3306` |
| `<MYSQL_USER>` / `<MYSQL_PASSWORD>` | MySQL 账号密码 | `root` / `<YOUR_PWD>` |
| `<MYSQL_DB>` | 业务数据库名 | `toinc_F1` |
| `<BACKEND_ADMIN_TOKEN>` | Admin 后台 Token（.env 里配置） | 自定强密码 |

> 约定：下文命令里，**本地用 PowerShell**（Windows），**远端用 bash**（Amazon Linux 2023 / Ubuntu / Debian / RHEL 系均可，只要有 docker + compose）。

---

## 1. 目标实例规格 & 必备软件

### 建议最低规格
| 项 | 要求 |
|---|---|
| OS | Linux（kernel ≥ 5.x 即可；测试通过 Amazon Linux 2023 / Ubuntu 22.04） |
| CPU | **≥ 2 vCPU**（Go build 慢；npm build 更慢，4 vCPU 更舒适） |
| 内存 | **≥ 4 GiB**（MySQL alone 就可能吃 2~4G；建议 8G） |
| 根磁盘 | **≥ 30 GiB**（docker images + npm cache 很容易 10G+） |
| 额外数据盘（可选） | **≥ 100 GiB** 挂载到 `/mnt/data`，放 MySQL 数据目录、日志归档（推荐） |
| 公网可达 | 80/443 端口必须放行（安全组 / iptables / firewall-cmd）；22 端口放行你的来源 IP |
| SSH 登录 | 用户 `<USER>` 必须能 **无密码 sudo** 或 **已加入 docker 组**（deploy.sh 会自动尝试） |

### 必备软件（目标实例）
| 软件 | 最低版本 | 作用 |
|---|---|---|
| Docker Engine | ≥ 24.x | 容器运行时；`systemctl enable docker` |
| Docker Compose（v2 plugin）或 docker-compose (v1) | Compose ≥ v2.x / v1 ≥ 1.29 | `docker compose` 或 `docker-compose`，deploy.sh 会自动探测 |
| Git | ≥ 2.30 | deploy.sh 拉代码（gh 不可用时 fallback） |
| acme.sh（`~/.acme.sh/`）| 最新 | 签发/续期 HTTPS 证书 |
| GitHub CLI `gh`（可选但推荐）| ≥ 2.x | 私有仓库 / 更高 API rate；公开仓库可不用 |
| OpenSSL（系统自带即可） | ≥ 1.1.1 | 证书检查 |

**安装速记（以 Amazon Linux 2023 为例）：**
```bash
# docker + compose plugin + git
sudo dnf install -y docker git docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
# 重新登录一次让 docker 组生效
# gh (https://github.com/cli/cli/blob/trunk/docs/install_linux.md)
# acme.sh (https://get.acme.sh | sh -s email=<CF_EMAIL>)
```

---

## 2. 对外访问入口（与域名无关的固定模式）

| 入口 | URL 模式 | 说明 |
|---|---|---|
| **Admin 管理后台** | `https://<DOMAIN>/` | Nginx 根路径 → `admin:80` |
| **Charts 遥测图表** | `https://<DOMAIN>/charts/` | `/charts*` → `charts:80` |
| **Backend API Base** | `https://<DOMAIN>/api/...` | `/api*` → `backend:8008` |
| **Swagger API 文档** | `https://<DOMAIN>/swagger/index.html` | `/swagger*` → `backend:8008` |
| **静态资源 (static/docs)** | `https://<DOMAIN>/static/` & `/docs/` | → backend 直接提供 |
| **WebSocket (F1 Live)** | `wss://<DOMAIN>/ws` 和 `/ws/` | Upgrade/Connection，3600s 超时 |
| HTTP → HTTPS 跳转 | `http://<DOMAIN>/*` | **301 Moved Permanently**（`/.well-known/acme-challenge/` 除外）+ 全局 HSTS（max-age=1y includeSubDomains） |

### 微信小程序相关（每次换域名都要同步！）
1. 小程序后台 → 开发设置 → 服务器域名：
   - **request 合法域名**：`https://<DOMAIN>`（替换掉旧域名）
   - **socket 合法域名**：`wss://<DOMAIN>`
2. 代码侧只需改一处：`miniprogram/app.js` 里的 `defaultApiBase = "https://<DOMAIN>"`，其它服务（requestJson / WSS / mpNewsApi / authService）统一读 `app.globalData.apiBase`，WSS 会自动从 `https://` 转换成 `wss://`。

---

## 3. 部署架构总览（固定，和实例无关）

```
                    0.0.0.0:80  +  0.0.0.0:443
                 ┌─────────────────────────────────┐
                 │  nginx-gateway                │
                 │  (nginx:alpine, bridge net)  │
                 └───────────────┬─────────────────┘
                                 │ 路径分流 (default.conf)
          ┌──────────────────────┼───────────────────────┐
          ▼                      ▼                       ▼
   /                     /charts/               /api|/swagger|/ws|/static|/docs
┌──────────┐        ┌────────────┐         ┌──────────────────┐
│ admin    │        │ charts     │         │ backend          │
│ :80 (expose only)│ :80 (expose only) │  :8008 (expose only) │
│ nginx+served SPA │ nginx+served SPA │  Go binary ./backend │
└────┬─────┘        └─────┬──────┘         └────────┬─────────┘
     │                    │                           │ MySQL
     └────────────────────┴─────────────────┐         │ 宿主机 bridge IP
                                            ▼         ▼
                                ┌────────────────────────────┐
                                │ mysql (宿主机已有容器)     │
                                │ 监听 <MYSQL_HOST>:<MYSQL_PORT> │
                                │ 数据库：<MYSQL_DB>         │
                                └────────────────────────────┘
```

- 4 个 F1 应用容器由 `<DEPLOY_ROOT>/docker-compose.yml` 管理（下文约定 `<DEPLOY_ROOT> = /opt/f1ink`），共用自定义 bridge `f1ink-net`。
- MySQL **默认不在 compose 里**：建议使用一个独立的、已存在的 MySQL 容器或托管 RDS；backend 通过 `TOINC_F1_MYSQL_HOST=<MYSQL_HOST>` 访问它（若 MySQL 是宿主机上另一个独立容器，通常填 `172.17.0.1`，即 docker0 宿主机侧网关；若是 RDS 就填 RDS endpoint）。
- backend/admin/charts 只 `expose:` 端口，**不直接绑定宿主机**；外部访问必须走 nginx-gateway 的 80/443。

### 典型资源占用基线（可作为新实例容量评估）
| 容器 | 典型内存基线 | 典型 CPU（空闲）|
|---|---|---|
| nginx-gateway | ~5~20 MiB | ~0% |
| admin (nginx + SPA) | ~3~10 MiB | ~0% |
| charts (nginx + SPA) | ~3~10 MiB | ~0% |
| backend (Go binary) | ~20~80 MiB | ~0%~5% |
| mysql:8.0（InnoDB buffer pool ~2~4G）| 2~5 GiB | ~0.5%~5% |

> ⚠️ 内存规划要点：MySQL 是最大头，建议把 **innodb_buffer_pool_size** 控制在「(实例总内存 - 2G) * 60%」以内，避免开启 backend 的后台调度器（OPENF1_SCHEDULER、MP_NEWS_SCHEDULER 等）后触发 OOM。

---

## 4. 监听端口（固定模式）

| 端口 | 绑定地址 | 对应进程/用途 |
|---|---|---|
| **80** | `0.0.0.0` + `[::]` | nginx-gateway 容器：HTTP → HTTPS 301 跳转 + ACME challenge |
| **443** | `0.0.0.0` + `[::]` | nginx-gateway 容器：HTTPS，对外唯一入口 |
| **22** | `0.0.0.0` + `[::]` | sshd（建议收窄安全组来源） |
| **3306** | `127.0.0.1` 或 `0.0.0.0`（取决于 MySQL 容器启动参数）| MySQL：若 MySQL 是宿主机另一容器，一般绑定 0.0.0.0 即可；生产建议仅绑 127.0.0.1 或用 VPC 内 RDS |

---

## 5. 部署目录结构（固定，建议根目录 `<DEPLOY_ROOT> = /opt/f1ink`）

```
/opt/f1ink/                           # 推荐用此路径；换路径时同步改 reload-nginx.sh 与 cron
├── deploy.sh                         # 一键拉代码 + build + up + 冒烟测试
├── reload-nginx.sh                   # acme.sh 续期证书后重启 nginx-gateway 的钩子
├── docker-compose.yml                # 4 服务编排 + f1ink-net
├── .env                              # 所有环境变量（DB 连接、Token、GitHub 仓库/分支、功能开关）
├── logs/
│   ├── deploy.log                    # 可选：deploy.sh tee 出来的运行日志（可加）
│   └── nginx/
│       ├── access.log                # nginx-gateway 访问日志（挂载到容器 /var/log/nginx）
│       └── error.log                 # nginx-gateway 错误日志
├── nginx/
│   ├── conf.d/
│   │   └── default.conf              # 路径分流 + HTTP→HTTPS 跳转 + TLS/HSTS
│   └── ssl/                          # acme.sh --install-cert 的目标目录
│       ├── fullchain.pem             # 证书链（Let's Encrypt 含中间件）
│       └── privkey.pem               # ECC/RSA 私钥
└── src/                              # deploy.sh 拉的代码副本，作为 docker build 的 context
    ├── backend/   (Dockerfile + Go)
    ├── admin/     (Dockerfile + Vue + nginx.conf)
    └── charts/    (Dockerfile + Vue + nginx.conf)
```

---

## 6. docker-compose.yml 模板（可直接抄）

```yaml
services:
  backend:
    build:
      context: ./src/backend
      dockerfile: Dockerfile
    container_name: f1ink-backend
    restart: unless-stopped
    expose:
      - "8008"
    environment:
      BACKEND_LISTEN_ADDR: ":8008"
      BACKEND_STATIC_DIR: "./static"
      BACKEND_UPDATE_DIR: "./static/update"
      BACKEND_TRUSTED_PROXIES: "${BACKEND_TRUSTED_PROXIES:-all}"
      BACKEND_LOG_REQUESTS: "${BACKEND_LOG_REQUESTS:-1}"
      BACKEND_REQUIRE_MYSQL: "${BACKEND_REQUIRE_MYSQL:-1}"
      BACKEND_ADMIN_TOKEN: "${BACKEND_ADMIN_TOKEN:-}"

      TOINC_F1_MYSQL_ENABLED:  "${TOINC_F1_MYSQL_ENABLED:-1}"
      TOINC_F1_MYSQL_HOST:     "${TOINC_F1_MYSQL_HOST:-172.17.0.1}"
      TOINC_F1_MYSQL_PORT:     "${TOINC_F1_MYSQL_PORT:-3306}"
      TOINC_F1_MYSQL_USER:     "${TOINC_F1_MYSQL_USER:-root}"
      TOINC_F1_MYSQL_PASSWORD: "${TOINC_F1_MYSQL_PASSWORD:-}"
      TOINC_F1_MYSQL_DB:       "${TOINC_F1_MYSQL_DB:-toinc_F1}"
      TOINC_F1_MYSQL_CHARSET:  "${TOINC_F1_MYSQL_CHARSET:-utf8mb4}"

      WECHAT_MINI_ENABLED:        "${WECHAT_MINI_ENABLED:-0}"
      WECHATPAY_ENABLED:          "${WECHATPAY_ENABLED:-0}"
      NEWS_WS_ENABLED:            "${NEWS_WS_ENABLED:-0}"
      OPENF1_ENABLED:             "${OPENF1_ENABLED:-0}"
      OPENF1_SCHEDULER_ENABLED:   "${OPENF1_SCHEDULER_ENABLED:-0}"
      MP_NEWS_SCHEDULER_ENABLED:  "${MP_NEWS_SCHEDULER_ENABLED:-0}"
    networks:
      - f1ink-net

  admin:
    build:
      context: ./src/admin
      dockerfile: Dockerfile
      args:
        VITE_API_BASE: "${ADMIN_VITE_API_BASE:-}"
    container_name: f1ink-admin
    restart: unless-stopped
    depends_on:
      - backend
    expose:
      - "80"
    networks:
      - f1ink-net

  charts:
    build:
      context: ./src/charts
      dockerfile: Dockerfile
      args:
        VITE_API_BASE: "${CHARTS_VITE_API_BASE:-}"
    container_name: f1ink-charts
    restart: unless-stopped
    depends_on:
      - backend
    expose:
      - "80"
    networks:
      - f1ink-net

  nginx-gateway:
    image: nginx:1.27-alpine
    container_name: f1ink-nginx-gateway
    restart: unless-stopped
    depends_on:
      - backend
      - admin
      - charts
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/conf.d:/etc/nginx/conf.d:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
      - ./logs/nginx:/var/log/nginx
    networks:
      - f1ink-net

networks:
  f1ink-net:
    driver: bridge
```

### `.env` 模板（**迁移时改这里即可，无需改 compose.yml**）

```bash
# ── Backend 基础 ──────────────────────────────────────────────
BACKEND_LISTEN_ADDR=:8008
BACKEND_STATIC_DIR=./static
BACKEND_UPDATE_DIR=./static/update
BACKEND_TRUSTED_PROXIES=all
BACKEND_LOG_REQUESTS=1
BACKEND_REQUIRE_MYSQL=1
BACKEND_ADMIN_TOKEN=<BACKEND_ADMIN_TOKEN>

# ── MySQL ─────────────────────────────────────────────────────
TOINC_F1_MYSQL_ENABLED=1
TOINC_F1_MYSQL_HOST=<MYSQL_HOST>
TOINC_F1_MYSQL_PORT=<MYSQL_PORT>
TOINC_F1_MYSQL_USER=<MYSQL_USER>
TOINC_F1_MYSQL_PASSWORD=<MYSQL_PASSWORD>
TOINC_F1_MYSQL_DB=<MYSQL_DB>
TOINC_F1_MYSQL_CHARSET=utf8mb4

# ── 功能开关（按需改成 1） ────────────────────────────────────
WECHAT_MINI_ENABLED=0
WECHATPAY_ENABLED=0
NEWS_WS_ENABLED=0
OPENF1_ENABLED=0
OPENF1_SCHEDULER_ENABLED=0
MP_NEWS_SCHEDULER_ENABLED=0

# ── Admin/Charts 构建时注入的 VITE_API_BASE（留空=同源）────
ADMIN_VITE_API_BASE=
CHARTS_VITE_API_BASE=

# ── 部署参数（deploy.sh 读取） ────────────────────────────────
GITHUB_REPO=<GITHUB_REPO>
GITHUB_BRANCH=<GITHUB_BRANCH>
```

> 💡 切分支/切仓库：只改 `.env` 里的 `GITHUB_REPO` / `GITHUB_BRANCH`，然后跑 `./deploy.sh`。

---

## 7. Nginx 网关路径分流表（内容固定，可直接复制使用）

来自 `<DEPLOY_ROOT>/nginx/conf.d/default.conf`：

```nginx
upstream backend_upstream { server backend:8008; }
upstream admin_upstream   { server admin:80; }
upstream charts_upstream  { server charts:80; }

server {
    listen 80;
    server_name <DOMAIN>;

    location /.well-known/acme-challenge/ { root /usr/share/nginx/html; }
    location / { return 301 https://$host$request_uri; }
}

server {
    listen 443 ssl;
    http2 on;
    server_name <DOMAIN>;

    ssl_certificate     /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    client_max_body_size 50M;
    access_log /var/log/nginx/access.log;
    error_log  /var/log/nginx/error.log;

    location /api/     { proxy_pass http://backend_upstream; include proxy_params_api; proxy_read_timeout 300s; }
    location /swagger/ { proxy_pass http://backend_upstream; }
    location /static/  { proxy_pass http://backend_upstream; }
    location /docs/    { proxy_pass http://backend_upstream; }

    location /ws  {
        proxy_pass http://backend_upstream;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600s; proxy_send_timeout 3600s;
        proxy_set_header Host $host; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto $scheme;
    }
    location /ws/ {
        proxy_pass http://backend_upstream;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600s; proxy_send_timeout 3600s;
        proxy_set_header Host $host; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /charts  { proxy_pass http://charts_upstream; }
    location /charts/ { proxy_pass http://charts_upstream; }

    location /        { proxy_pass http://admin_upstream; }
}
```

> 说明：上面 `include proxy_params_api;` 是示意；实际生产配置里每条 location 都应手动写 `proxy_set_header Host/X-Real-IP/X-Forwarded-For/X-Forwarded-Proto`，以避免与 nginx 镜像内默认 `proxy_params` 文件位置不一致。

| 匹配路径（443 server） | upstream | 特殊配置 |
|---|---|---|
| `/api/*` | `backend:8008` | `proxy_read_timeout 300s`（慢查询 / 大数据） |
| `/swagger/*` | `backend:8008` | |
| `/static/*` | `backend:8008` | |
| `/docs/*` | `backend:8008` | |
| `/ws` & `/ws/*` | `backend:8008` | **Upgrade + Connection: upgrade**，`3600s` 读写超时 |
| `/charts` & `/charts/*` | `charts:80` | SPA nginx 容器 |
| `/`（兜底） | `admin:80` | SPA nginx 容器 |

---

## 8. HTTPS 证书 + 自动续期（acme.sh + Cloudflare DNS-01）模式

> 为什么 DNS-01：不依赖 80 端口放文件、对 Cloudflare 托管的域名最省心、证书不会因为 80 跳转出问题。

### 变量 & 假设
- `<DOMAIN>` 的 DNS 必须在 Cloudflare（Zone：`<CF_ZONE>`）。
- 目标实例有环境变量 `CF_Token`（Cloudflare API Token，DNS Edit 权限）；或一次性导入后由 acme.sh 持久化。

### 一次性签发 + 自动续期钩子（在目标实例执行）

```bash
# 0) 确保 CF_Token 存在；若 acme.sh 未安装先安装：
#    curl https://get.acme.sh | sh -s email=<CF_EMAIL>
#    source ~/.bashrc   # 把 ~/.acme.sh 加 PATH

# 1) 注册并签发（ECC 256，更小更快；签发失败会保留日志 ~/.acme.sh/acme.sh.log）
export CF_Token="<你的 Cloudflare API Token>"
~/.acme.sh/acme.sh --set-default-ca --server letsencrypt
~/.acme.sh/acme.sh --issue -d "<DOMAIN>" --dns dns_cf -k ec-256

# 2) 安装到部署目录 + 写入 reload 钩子
mkdir -p /opt/f1ink/nginx/ssl
~/.acme.sh/acme.sh --install-cert -d "<DOMAIN>" --ecc \
  --fullchain-file /opt/f1ink/nginx/ssl/fullchain.pem \
  --key-file       /opt/f1ink/nginx/ssl/privkey.pem   \
  --reloadcmd      "/opt/f1ink/reload-nginx.sh"

# 3) acme.sh 会自己写一条 cron（一般是每天 0/6/12/18 点的某分钟），
#    确保 crontab -l 能看到 ~/.acme.sh/acme.sh --cron 条目，不要手动删。
```

### `<DEPLOY_ROOT>/reload-nginx.sh` 内容（固定）

```bash
#!/bin/bash
# acme.sh 证书安装/续期成功后触发的 reload hook
set -e
cd /opt/f1ink
docker-compose restart nginx-gateway >> /tmp/nginx-reload.log 2>&1
```

### 续期链路（固定，跟域名解耦）

| 项 | 模式 |
|---|---|
| **证书类型** | Let's Encrypt ECC `ec-256`（推荐用 ECC，性能/握手延迟/尺寸都更好） |
| **挑战方式** | Cloudflare DNS-01（`--dns dns_cf`） |
| **CF Token 持久化** | 执行过一次 `--issue` 后，acme.sh 会把 `CF_Token` 存进 `~/.acme.sh/account.conf`（`SAVED_CF_Token=...`），所以即便后续 shell 没有导出 `CF_Token`，`--cron` 也能续期 |
| **cron 频率** | acme.sh 默认每天 4 次检查（0/6/12/18 点），到 renew 窗口才真的重签；窗口一般是到期前 30 天内 |
| **证书部署后钩子** | `--reloadcmd "/opt/f1ink/reload-nginx.sh"` → 重启 nginx-gateway 容器，使新证书生效 |

### 检查 & 手动验证命令（通用）

```bash
# 看 acme.sh 管理的证书（含 Domain / 签发时间 / 下次 renew 建议时间）
~/.acme.sh/acme.sh --list

# 看当前 Nginx 正在用的证书
openssl x509 -in /opt/f1ink/nginx/ssl/fullchain.pem -noout -dates -subject -issuer

# 手动强制续期（未到 renew 窗口一般返回 Skip；想真的重签加 --force，但消耗签发额度慎用）
~/.acme.sh/acme.sh --renew -d "<DOMAIN>" --dns dns_cf --force
```

---

## 9. 一键部署脚本模式（`<DEPLOY_ROOT>/deploy.sh`，可直接复用）

部署脚本职责固定：**检查 docker/compose → 读 `.env` → 拉 GitHub 代码 → build → 滚动重启 → 冒烟**。

### 你本机 PowerShell 执行（迁移到新实例时，只改 `$pem / $ip`）

```powershell
$pem = "<SSH_KEY_PATH>"
$ip  = "<USER>@<HOST>"

# 重新部署
ssh -i $pem $ip 'cd /opt/f1ink && ./deploy.sh'
```

### 脚本核心工作流（9 步，稳定版推荐保持一致）

1. **Docker/compose 可用性探测**：优先当前用户 docker；不可用则自动尝试 `sudo docker`；再失败就 die 并给 `usermod -aG docker $USER` 提示。
2. **加载 `.env`**：`set -a; source .env; set +a`。
3. **拉代码（双模式）**：
   - Mode A（优先）`fetch_via_gh`：`gh` 已安装且 `gh auth status` 通过 → `gh repo clone` / `gh repo sync` 或等价 `git reset --hard origin/<branch>`。
   - Mode B（兜底）`fetch_via_git`：`git clone --branch <branch> --single-branch https://github.com/<repo>.git ./src/`，存在则 `git fetch + git reset --hard origin/<branch>`。
   - ✅ 两种模式都可用；公开仓库 **不需要 gh 登录**。
4. **Dockerfile 存在性检查**：`src/{backend,admin,charts}/Dockerfile` 必须齐全。
5. **停旧容器** `docker-compose down --remove-orphans`（注意：不会删 volume，nginx 日志 / mysql 数据如果是 volume 不会掉）。
6. **Build**：`docker-compose build`（依赖 Docker 层缓存，第一次慢，第二次快）。
7. **Up**：`docker-compose up -d`。
8. **等待 + 容器状态 + backend 最近日志**：`sleep 8`，打印 `docker-compose ps`、`docker-compose logs --tail 20 backend`。
9. **Gateway 冒烟测试**：本机 loopback `curl http://127.0.0.1:80/api/v1/...` 最多 6 次（<500 即判成功），避免把宕机状态当成功。

> 建议：deploy.sh 开头追加 `exec > >(tee -a /opt/f1ink/logs/deploy.log) 2>&1; echo "===== deploy started $$ $(date) ====="`，便于事后审计每次部署。

---

## 10. 常用运维命令模板（通用；把 `<SSH_KEY_PATH>` / `<USER>@<HOST>` 换掉即可）

```powershell
$pem = "<SSH_KEY_PATH>"
$ip  = "<USER>@<HOST>"

# ── 状态 / Top ──────────────────────────────────────────────
ssh       -i $pem $ip "cd /opt/f1ink; docker-compose ps"
ssh       -i $pem $ip "docker stats --no-stream"            # 容器级 top 快照
ssh -it   -i $pem $ip "cd /opt/f1ink && docker stats"       # 容器级 top（持续刷新）
ssh       -i $pem $ip "docker top f1ink-backend"            # backend 容器进程列表
ssh       -i $pem $ip "docker top f1ink-mysql"              # MySQL 容器进程列表（若容器叫这个）

# ── 日志 ─────────────────────────────────────────────────────
ssh -i $pem $ip "cd /opt/f1ink; docker-compose logs -f --tail 100"
ssh -i $pem $ip "cd /opt/f1ink; docker-compose logs -f --tail 200 backend"
ssh -i $pem $ip "cd /opt/f1ink; docker-compose logs -f --tail 200 nginx-gateway"
ssh -i $pem $ip "tail -50 /opt/f1ink/logs/nginx/access.log"
ssh -i $pem $ip "tail -50 /opt/f1ink/logs/nginx/error.log"

# ── 进入容器 ─────────────────────────────────────────────────
ssh -it -i $pem $ip "docker exec -it f1ink-backend sh"
ssh -it -i $pem $ip "docker exec -it f1ink-nginx-gateway sh"

# ── 重启 / 停服务 ────────────────────────────────────────────
ssh -i $pem $ip "cd /opt/f1ink; docker-compose restart nginx-gateway"
ssh -i $pem $ip "cd /opt/f1ink; docker-compose restart backend"
ssh -i $pem $ip "cd /opt/f1ink; docker-compose down"

# ── 证书 / 续期 ──────────────────────────────────────────────
ssh -i $pem $ip "~/.acme.sh/acme.sh --list"
ssh -i $pem $ip "cat ~/.acme.sh/acme.sh.log | tail -30"
ssh -i $pem $ip "crontab -l"
ssh -i $pem $ip "openssl x509 -in /opt/f1ink/nginx/ssl/fullchain.pem -noout -dates -subject -issuer"
```

---

## 11. 迁移/上线 Checklist（从 0 到可用的一套步骤）

按顺序执行，任何一步失败不要再往下走：

1. **目标实例就绪**：`<USER>` 能 ssh 上去、sudo/dockerd/docker compose 可用、安全组放行 80/443/22。
2. **域名就绪**：`<DOMAIN>` 的 Cloudflare Zone 已存在，DNS A/CNAME 指向 `<HOST>`，`CF_Token`（DNS Edit 权限）在手。
3. **建目录 + 复制三件套模板**：
   - `/opt/f1ink/docker-compose.yml`（本文第 6 节）
   - `/opt/f1ink/.env`（`<BACKEND_ADMIN_TOKEN>` / MySQL / `<GITHUB_REPO>`/`<GITHUB_BRANCH>` 全部填好）
   - `/opt/f1ink/nginx/conf.d/default.conf`（第 7 节；把 `<DOMAIN>` 替换成真域名）
   - `/opt/f1ink/deploy.sh`（第 9 节；`chmod +x`）
   - `/opt/f1ink/reload-nginx.sh`（第 8 节；`chmod +x`）
   - `mkdir -p /opt/f1ink/logs/nginx /opt/f1ink/nginx/ssl /opt/f1ink/src`
4. **签发 HTTPS 证书**（第 8 节的 `--issue` + `--install-cert`）。
5. **首次跑 deploy.sh**：`cd /opt/f1ink && ./deploy.sh`，观察：
   - build 是否成功（npm 慢是正常的，第一次会拉 node_modules）
   - `docker-compose ps` 四个服务全部 Up
   - 冒烟测试 `/api/v1/f1/...` 返回 2xx/4xx（非 5xx）
6. **本地 curl 验证 HTTP→HTTPS**：`curl -I http://<DOMAIN>/` → 301 → `Location: https://...`
7. **浏览器验证四条入口**：`/`、`/charts/`、`/swagger/index.html`、`/api/v1/f1/session-meta?season=2025`，全部 200。
8. **证书外部验证**：`curl -vI https://<DOMAIN>/` 看证书链与 notAfter 是否正确。
9. **微信小程序（若用到）**：后台服务器域名改成新域名，`miniprogram/app.js` 的 `defaultApiBase` 同步改。
10. **确认 cron**：`crontab -l` 能看到 acme.sh 自动加的 `--cron` 条目；必要时手动跑一次 `~/.acme.sh/acme.sh --cron --force` 看日志没报错。

---

## 12. 常见风险 & 建议行动项（不是实例绑定的，迁移时仍适用）

1. **gh 是否登录无所谓，但私有仓库一定要登录**：`gh auth login` 一次即可。公开仓库 deploy.sh 永远能走 git HTTPS fallback。
2. **MySQL 内存占大头**：若准备开 `OPENF1_SCHEDULER_ENABLED=1` / `MP_NEWS_SCHEDULER_ENABLED=1`，务必先压测 MySQL，并把 `innodb_buffer_pool_size` 降到「实例总内存 - 2G」的 60% 以下；必要时给 MySQL 容器加 `--memory/--memory-swap` 防止 OOM 把宿主机搞挂。
3. **操作系统安全补丁**：Amazon Linux 2023 / Ubuntu 都建议上线前后跑一次 `sudo dnf -y upgrade` 或 `sudo apt-get update && sudo apt-get -y upgrade`，重启确认启动自恢复。
4. **数据盘 `/mnt/data` 利用**：建议把 MySQL 数据目录、Nginx 日志归档、docker images（改 `/etc/docker/daemon.json` 的 `data-root`）迁到大数据盘，避免 50G 根盘被日志/镜像撑满。
5. **deploy 日志落盘**：建议 deploy.sh 加 tee 到 `logs/deploy.log`，加 pid/date 分隔线，审计每次发版。
6. **HTTPS 评分优化（可选）**：要打 SSL Labs A+，可加 OCSP stapling（`ssl_stapling on; ssl_stapling_verify on; resolver 1.1.1.1;`）和 CAA DNS 记录。

---

### 迁移变量速查表（再贴一次，方便你 CTRL+F）

`<USER>` / `<HOST>` / `<SSH_KEY_PATH>` / `<DOMAIN>` / `<CF_EMAIL>` / `<CF_ZONE>` / `<GITHUB_REPO>` / `<GITHUB_BRANCH>` / `<MYSQL_HOST>` / `<MYSQL_PORT>` / `<MYSQL_USER>` / `<MYSQL_PASSWORD>` / `<MYSQL_DB>` / `<BACKEND_ADMIN_TOKEN>`
