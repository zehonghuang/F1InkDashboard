#!/usr/bin/env bash
# =============================================================================
# F1 Ink - enhanced deploy.sh
# Usage examples:
#   ./deploy.sh                         日常完整部署 (fetch + build all + up + smoke)
#   ./deploy.sh deploy                  同上 (explicit)
#   ./deploy.sh --only admin-v2         只构建+重启 admin-v2
#   ./deploy.sh deploy --no-build       不拉代码也不构建，只 up -d + 冒烟（改完 compose/env/nginx 用）
#   ./deploy.sh deploy --no-fetch       不 git fetch，用当前 src/ 构建
#   ./deploy.sh deploy --branch feature/admin-2fa
#   ./deploy.sh deploy --env-file .env.staging
#
#   ./deploy.sh ps                      = docker compose ps
#   ./deploy.sh ps --only backend
#   ./deploy.sh logs admin              看单个容器日志 (tail -f 30 lines, Ctrl-C 退出)
#   ./deploy.sh logs nginx-gateway 200  看最后 200 行（非 follow）
#   ./deploy.sh stats                   docker stats --no-stream
#   ./deploy.sh build                   同 build（不会 up）
#   ./deploy.sh restart admin-v2        重启某个容器
#   ./deploy.sh stop charts             停止
#   ./deploy.sh down                    停止并删除所有容器（不动 volume/镜像）
#   ./deploy.sh clean                   down + docker image prune -f
#   ./deploy.sh check-config            docker compose config 验证
# =============================================================================
set -uo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$ROOT/logs"
mkdir -p "$LOG_DIR"
NOW="$(date +%Y%m%d-%H%M%S)"
LOG="$LOG_DIR/deploy-$NOW.log"
touch "$LOG"

# =============================================================================
# Helpers
# =============================================================================
TS()        { date '+%Y-%m-%d %H:%M:%S'; }
log()       { echo "[$(TS)] $*" | tee -a "$LOG"; }
die()       { echo "ERROR: $*" >&2; exit 1; }
banner()    { echo "============================================================" | tee -a "$LOG"; }
section()   { banner; log "$*"; banner; }

usage() {
  cat <<'USAGE'
F1 Ink deploy.sh (enhanced) — v2

用法:
  ./deploy.sh [COMMAND] [FLAGS] [ARGS...]

Commands (缺省 = deploy):
  deploy             标准部署: fetch -> build -> up -d -> reload -> smoke
  fetch              只拉最新代码 (src/)
  build [SVC...]     只构建镜像 (缺省 = 所有有 Dockerfile 的服务)
  up [SVC...]        docker compose up -d
  restart <SVC...>   重启指定容器
  stop    <SVC...>   停止指定容器
  down               down 所有容器 (保留 volume/镜像)
  clean              down + prune dangling images
  ps [SVC...]        docker compose ps
  logs <SVC> [N]     查看某个容器的日志; [N]=行数(默认80), 没写就是 follow
  stats              docker stats --no-stream (容器 top 视图)
  check-config       docker compose config 验证 (打印最终 yaml)
  help               显示本帮助

Flags (deploy/fetch/build/up 命令通用, 必须放在 COMMAND 之前或之后都行):
  --only SVC         只对单个容器执行 build/up/restart。等价于直接给子命令传 SVC 参数
  --branch BRANCH    指定 git 分支 (仅 deploy/fetch)
  --env-file PATH    指定 .env 路径 (默认 $ROOT/.env)
  --no-fetch         deploy 时不拉代码
  --no-build         deploy 时不 build (只 up -d + smoke)
  --verbose,-v       日志更啰嗦 (目前透传到 build)

新增服务 / 即插即用 (不用改本脚本)：
  1) 在 docker-compose.yml 里加 <name>: { build: { context: ./src/<name>, dockerfile: Dockerfile } }
     再加上 container_name: f1ink-<name>、expose: ["80"]、networks: [f1ink-net]
  2) 把项目代码放到仓库 src/<name>/ 下 (src/<name>/Dockerfile 存在即可)
  3) 在 nginx/conf.d/default.conf 加 <name>_upstream + location 分流
  4) (可选) 改 .env 追加 SMOKE_PATHS="... /<name>/ ..." 让 deploy 时自动测 (详见脚本)
  完成以上 4 步, ./deploy.sh build/ps/restart/up/logs 全部自动识别，无需改 deploy.sh。
  若 SMOKE_PATHS 语法 (写在 /opt/f1ink/.env 里):
    SMOKE_PATHS="/admin/|^200$  /admin-v2/|^200$  /charts/|^200$  /<新服务前缀/  /  /api/v1/health|^404$
    EXTERNAL_SMOKE_PATHS="/admin-v2/ / /<新服务前缀/"


举例:
  ./deploy.sh                                  # 完整部署一遍
  ./deploy.sh --only admin-v2                  # 只部署 admin-v2 (build+up+smoke)
  ./deploy.sh deploy --only backend --no-fetch # 用当前 src/ 只重部署 backend
  ./deploy.sh build admin-v2 admin             # 只构建 admin-v2 + admin 镜像
  ./deploy.sh restart nginx-gateway            # 改完 nginx conf 后重启网关重载配置
  ./deploy.sh logs admin                       # follow 老 admin 容器日志
  ./deploy.sh stats                            # 容器资源占用快照
USAGE
}

# =============================================================================
# Detect docker compose & read base env
# =============================================================================
detect_dc() {
  if docker compose version >/dev/null 2>&1; then
    DC="docker compose"
  elif command -v docker-compose >/dev/null 2>&1; then
    DC="docker-compose"
  else
    die "Neither 'docker compose' (v2 plugin) nor 'docker-compose' (v1) found in PATH"
  fi
  return 0
}
detect_dc

# .env 路径支持 --env-file
ENV_FILE="$ROOT/.env"
GITHUB_BRANCH_OVERRIDE=""
ONLY_SVC=""
NO_FETCH=0
NO_BUILD=0
VERBOSE=0

# =============================================================================
# Arg parsing: 先扫 FLAGS, 剩下的是 COMMAND + ARGS
# =============================================================================
ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    help|--help|-h)
      usage; exit 0
      ;;
    --only)
      [ $# -ge 2 ] || die "--only 需要一个服务名"
      ONLY_SVC="$2"; shift 2
      ;;
    --only=*)
      ONLY_SVC="${1#--only=}"; shift
      ;;
    --branch)
      [ $# -ge 2 ] || die "--branch 缺值"
      GITHUB_BRANCH_OVERRIDE="$2"; shift 2
      ;;
    --branch=*)
      GITHUB_BRANCH_OVERRIDE="${1#--branch=}"; shift
      ;;
    --env-file)
      [ $# -ge 2 ] || die "--env-file 缺值"
      ENV_FILE="$2"; shift 2
      ;;
    --env-file=*)
      ENV_FILE="${1#--env-file=}"; shift
      ;;
    --no-fetch) NO_FETCH=1; shift ;;
    --no-build) NO_BUILD=1; shift ;;
    -v|--verbose) VERBOSE=1; shift ;;
    --) shift; while [ $# -gt 0 ]; do ARGS+=("$1"); shift; done ;;
    -*) die "Unknown flag: $1. 运行 ./deploy.sh --help 看用法" ;;
    *)  ARGS+=("$1"); shift ;;
  esac
done

# 恢复参数 (去掉 FLAGS 后的纯命令+参数)
set -- "${ARGS[@]}"
CMD="${1:-deploy}"
[ $# -gt 0 ] && shift

# 如果用了 --only，但参数列表里没有给子命令传 services, 就把 ONLY_SVC 展开成 $@
if [ -n "$ONLY_SVC" ] && [ $# -eq 0 ]; then
  set -- "$ONLY_SVC"
fi

# 命令转小写
CMD_LOWER="$(echo "$CMD" | tr 'A-Z' 'a-z')"

[ -f "$ENV_FILE" ] || die ".env not found: $ENV_FILE"
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${GITHUB_REPO:=zehonghuang/F1InkDashboard}"
if [ -n "$GITHUB_BRANCH_OVERRIDE" ]; then
  GITHUB_BRANCH="$GITHUB_BRANCH_OVERRIDE"
fi
: "${GITHUB_BRANCH:=main}"
: "${GATEWAY_DOMAIN:=f1ink.normal-person.icu}"

SRC_DIR="$ROOT/src"

# ---------------------------------------------------------------
# 从 docker-compose.yml 里读取所有声明了 build 段的服务名
# 这样你只要往 compose 里加 build: 段 + context 指向的目录里有 Dockerfile
# deploy.sh build 就能自动识别，不用手动改 build_targets 列表
# 解析策略：
#   1) 先试 python3 读 `docker compose config` 的 YAML —— 最准
#   2) 没 python3 时 fallback 到 `grep` services 后的缩进 + `build:`
# ---------------------------------------------------------------
discover_buildable_services() {
  local raw
  raw=$(dc config 2>/dev/null || true)
  [ -z "$raw" ] && return 0
  if command -v python3 >/dev/null 2>&1; then
    python3 - "$raw" <<'PY' 2>/dev/null || true
import sys, yaml
try:
    d = yaml.safe_load(sys.argv[1])
except Exception:
    sys.exit(0)
svcs = d.get('services', {}) or {}
for name, s in svcs.items():
    if isinstance(s, dict) and 'build' in s:
        print(name)
PY
    return 0
  fi
  # fallback grep
  echo "$raw" | awk '
    /^services:/ { in_svc=1; next }
    in_svc && /^[a-zA-Z0-9_-]+:/ { cur=$1; gsub(":$","",cur); has_build=0; next }
    in_svc && cur!="" && /^    build:/ { if(!has_build){ print cur; has_build=1 } next }
    NF && in_svc && /^[a-zA-Z]/ { in_svc=0 }
  ' 2>/dev/null
}

# $@ 就是用户显式指定的 services 列表；没给就自动发现 compose 里所有 buildable service
build_targets() {
  local tgt=("$@")
  if [ ${#tgt[@]} -eq 0 ]; then
    local auto
    if mapfile -t auto < <(discover_buildable_services) && [ ${#auto[@]} -gt 0 ]; then
      tgt=("${auto[@]}")
    else
      # fallback：还按老的 4 个兜底
      for d in backend admin admin-v2 charts; do
        [ -f "$ROOT/src/$d/Dockerfile" ] && tgt+=("$d")
      done
    fi
  fi
  echo "${tgt[@]}"
}

dc() {
  $DC -f "$ROOT/docker-compose.yml" --env-file "$ENV_FILE" "$@"
}

# =============================================================================
# Sub-commands
# =============================================================================
cmd_fetch() {
  section "Fetch source (branch=$GITHUB_BRANCH)"
  mkdir -p "$SRC_DIR"
  pushd "$SRC_DIR" >/dev/null
  GIT_URL="https://github.com/${GITHUB_REPO}.git"
  if gh auth status >/dev/null 2>&1; then
    log "(gh) authenticated access"
    if [ -d .git ]; then
      gh repo sync "$GITHUB_REPO" --branch "$GITHUB_BRANCH" --force >/dev/null 2>&1 || true
      git fetch --all --prune --depth 50 >>"$LOG" 2>&1
      git checkout "$GITHUB_BRANCH" >>"$LOG" 2>&1
      git reset --hard "origin/$GITHUB_BRANCH" >>"$LOG" 2>&1
    else
      gh repo clone "$GITHUB_REPO" . -- --branch "$GITHUB_BRANCH" --single-branch --depth 50 >>"$LOG" 2>&1
    fi
  else
    log "(git) HTTPS clone/pull: $GIT_URL"
    if [ -d .git ]; then
      git remote set-url origin "$GIT_URL" 2>/dev/null || true
      git fetch origin "$GITHUB_BRANCH" --prune --depth 50 >>"$LOG" 2>&1
      git checkout "$GITHUB_BRANCH" >>"$LOG" 2>&1
      git reset --hard "origin/$GITHUB_BRANCH" >>"$LOG" 2>&1
    else
      git clone --branch "$GITHUB_BRANCH" --single-branch --depth 50 "$GIT_URL" . >>"$LOG" 2>&1
    fi
  fi
  local HEAD SUBJ
  HEAD="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
  SUBJ="$(git log -1 --pretty=%s 2>/dev/null || echo '')"
  popd >/dev/null
  log "Source ready. HEAD=$HEAD  $SUBJ"
  # 基本文件存在性检查
  local d
  for d in backend admin admin-v2 charts; do
    if [ -f "$ROOT/src/$d/Dockerfile" ]; then
      log "  OK  src/$d/Dockerfile ($(wc -c < "$ROOT/src/$d/Dockerfile") bytes)"
    else
      die "Missing Dockerfile: src/$d/Dockerfile (你是不是没 push？)"
    fi
  done
  [ -f "$ROOT/nginx/conf.d/default.conf" ] || die "Missing nginx config: nginx/conf.d/default.conf"
}

cmd_check_config() {
  log "== docker compose config =="
  dc config
  log "check-config OK"
  local -a autos
  if mapfile -t autos < <(discover_buildable_services); then
    log "  自动发现的 buildable services = [${autos[*]:-<none>}]"
  fi
  log "  SMOKE_PATHS (当前生效):"
  if [ -n "${SMOKE_PATHS:-}" ]; then
    log "    [env 覆盖] $SMOKE_PATHS"
  else
    log "    [默认] /api/v1/health|^[234]xx$  /admin/ /admin-v2/ /charts/ /  (严格 2xx)  /ws/... (101/4xx/5xx)"
  fi
}

cmd_build() {
  local tgt
  mapfile -t tgt < <(build_targets "$@")
  section "Build images: ${tgt[*]}"
  local extra=()
  [ "$VERBOSE" -eq 1 ] && extra+=(--progress=plain)
  dc build "${extra[@]}" "${tgt[@]}" 2>&1 | tee -a "$LOG" | tail -n 50
}

cmd_up() {
  local tgt=("$@")
  section "docker compose up -d: ${tgt[*]:-<all services>}"
  dc up -d "${tgt[@]}" 2>&1 | tee -a "$LOG" | tail -n 30
}

cmd_smoke() {
  section "Smoke testing"
  local curl_common="-sk --max-time 10 --resolve ${GATEWAY_DOMAIN}:443:127.0.0.1"
  local code
  sm() {
    local path="$1" expect="${2:-^[234][0-9][0-9]$}" ok
    code=$(curl $curl_common -o /dev/null -w '%{http_code}' "https://${GATEWAY_DOMAIN}${path}")
    ok=$( [[ "$code" =~ $expect ]] && echo "OK" || echo "??" )
    log "  $path  -> HTTP $code  [$ok]"
  }
  # ---------------------------------------------------------------
  # SMOKE_PATHS 支持从 .env 里覆盖（空格分隔 path,可选码正则）
  #   行内用 "PATH|REGEX" 写法给单个路径指定断言正则
  #   例：
  #   SMOKE_PATHS="/api/v1/health /admin/|^200$ /admin-v2/|^200$ /charts/ /foo/|^200$ /"
  # 没设就用默认（4 个 SPA + backend health + WS）
  # ---------------------------------------------------------------
  local default_paths=(
    "/api/v1/health|^[234][0-9][0-9]$"
    "/admin/|^[23][0-9][0-9]$"
    "/admin-v2/|^[23][0-9][0-9]$"
    "/charts/|^[23][0-9][0-9]$"
    "/|^[23][0-9][0-9]$"
    "/ws/motorsport/live|^101|4[0-9][0-9]|5[0-9][0-9]$"
  )
  local user_paths=()
  if [ -n "${SMOKE_PATHS:-}" ]; then
    # shellcheck disable=SC2206
    user_paths=($SMOKE_PATHS)
  fi
  local paths=("${user_paths[@]:-${default_paths[@]}}")
  local entry p rx
  for entry in "${paths[@]}"; do
    if [[ "$entry" == *"|"* ]]; then
      p="${entry%%|*}"; rx="${entry#*|}"
      sm "$p" "$rx"
    else
      sm "$entry"
    fi
  done

  log "External HTTPS smoke (real DNS, optional):"
  # 可选：EXTERNAL_SMOKE_PATHS 从 .env 覆盖；默认测 /admin-v2/ 和 /
  local ext_default=("/admin-v2/" "/")
  local ext_user=()
  if [ -n "${EXTERNAL_SMOKE_PATHS:-}" ]; then
    # shellcheck disable=SC2206
    ext_user=($EXTERNAL_SMOKE_PATHS)
  fi
  local ext=("${ext_user[@]:-${ext_default[@]}}")
  local p2
  for p2 in "${ext[@]}"; do
    curl -sS --max-time 10 -o /dev/null -w "  $p2 -> %{http_code}\n" "https://${GATEWAY_DOMAIN}${p2}" 2>&1 | tee -a "$LOG" || true
  done
}

cmd_reload_nginx() {
  log "Reload nginx gateway (if running)"
  # nginx -s reload 最快；若容器还没起来就忽略，等 up 那一步
  docker exec f1ink-nginx-gateway nginx -s reload 2>/dev/null || true
}

print_docker_cheatsheet() {
  local all="f1ink-backend,f1ink-admin,f1ink-admin-v2,f1ink-charts,f1ink-nginx-gateway"
  cat <<EOF

----------------------------------------------------------------
 部署完成 — Docker 常用命令（/opt/f1ink 目录下执行）
----------------------------------------------------------------
  容器列表:              ./deploy.sh ps
  容器资源快照 (top):    ./deploy.sh stats
  看某个容器日志:        ./deploy.sh logs admin-v2  [行数或留空就 follow]
  只重启网关(改了 conf): ./deploy.sh restart nginx-gateway
  只重部署 admin-v2:     ./deploy.sh --only admin-v2
  只构建 admin-v2:       ./deploy.sh build admin-v2
  不重构建只用 up:       ./deploy.sh deploy --no-build
  验证 compose yaml:     ./deploy.sh check-config
  停止所有容器:          ./deploy.sh down       (不动 volume/镜像)
  清理无用镜像:          ./deploy.sh clean
  原生 docker compose:   cd /opt/f1ink ; docker compose {ps,logs,restart} ...

  容器名速查:  $all
  网关日志文件:  /opt/f1ink/logs/nginx/access.log  error.log
  本脚本日志:    /opt/f1ink/logs/deploy-YYYYMMDD-HHMMSS.log
----------------------------------------------------------------
EOF
}

cmd_deploy() {
  log "Using docker:         $(command -v docker)"
  log "Using docker-compose: $(command -v $(echo $DC | cut -d' ' -f1))"
  section "Deploying $GITHUB_REPO (branch=$GITHUB_BRANCH)"

  [ "$NO_FETCH"  -eq 1 ] || cmd_fetch
  [ "$NO_BUILD"  -eq 1 ] || cmd_build  "$@"
  cmd_up "$@"
  cmd_reload_nginx
  cmd_smoke
  banner
  log "Deployment OK. log = $LOG"
  banner
  print_docker_cheatsheet
}

cmd_ps()    { dc ps "$@"; }
cmd_stats() { docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.NetIO}}\t{{.BlockIO}}" ; }
cmd_down()  { dc down "$@"; log "containers down OK"; }
cmd_clean() { dc down -t 60; docker image prune -f; log "clean OK"; }
cmd_stop()  { local t=("$@"); [ ${#t[@]} -gt 0 ] || die "stop 需要至少一个服务名"; dc stop "${t[@]}"; }
cmd_restart(){ local t=("$@"); [ ${#t[@]} -gt 0 ] || die "restart 需要至少一个服务名"; dc restart "${t[@]}"; }

cmd_logs() {
  local svc="${1:-}" n="${2:-}"
  [ -n "$svc" ] || die "logs 需要服务名，例如: ./deploy.sh logs admin-v2 100"
  if [ -n "$n" ]; then
    dc logs --tail "$n" "$svc"
  else
    dc logs -f --tail 80 "$svc"
  fi
}

# =============================================================================
# Dispatch
# =============================================================================
echo "== deploy start $(TS) ==" > "$LOG" 2>&1
log "LOG FILE: $LOG"

case "$CMD_LOWER" in
  deploy|'')          cmd_deploy "$@" ;;
  fetch)              cmd_fetch  "$@" ;;
  build)              cmd_build  "$@" ;;
  up)                 cmd_up     "$@" ;;
  ps)                 cmd_ps     "$@" ;;
  logs)               cmd_logs   "$@" ;;
  stats)              cmd_stats  "$@" ;;
  restart)            cmd_restart "$@" ;;
  stop)               cmd_stop    "$@" ;;
  down)               cmd_down    "$@" ;;
  clean)              cmd_clean   "$@" ;;
  check-config|config|validate) cmd_check_config "$@" ;;
  help|-h|--help)     usage ;;
  *) die "Unknown command: $CMD. 运行 ./deploy.sh --help 看用法" ;;
esac
