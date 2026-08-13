#!/bin/bash
set -uo pipefail
cd /opt/f1ink

# ===== 验证语法 =====
echo "== 1. bash -n syntax check =="
bash -n /tmp/deploy.sh.new.v2 || exit 1
echo "OK"

# ===== 备份 + 替换 =====
echo "== 2. backup =="
TS=$(date +%Y%m%d-%H%M%S)
cp deploy.sh "scripts/deploy.sh.bak.auto-buildable-v2-before-$TS"
cp deploy.sh "scripts/deploy.sh.bak.auto-buildable-v2-before-latest"
ls -la scripts/deploy.sh.bak.* | tail -5

echo "== 3. 覆盖为 v2 脚本 =="
cp /tmp/deploy.sh.new.v2 deploy.sh
chmod +x deploy.sh
echo "new size=$(wc -c < deploy.sh)"

echo ""
echo "== 4. ./deploy.sh --help  =="
./deploy.sh --help 2>&1 | tail -30

echo ""
echo "== 5. ./deploy.sh check-config (验证自动发现 buildable services) =="
./deploy.sh check-config 2>&1 | grep -E "自动发现|SMOKE|OK|services|services list" | head -20

echo ""
echo "== 6. ./deploy.sh build --no-fetch (走自动发现 build_targets，理论上 backend/admin/admin-v2/charts 全 cache) =="
# 用 deploy 不会，我们直接调用 build_targets 逻辑验证一下:
echo "build_targets 自动返回: $(bash -c 'source /opt/f1ink/deploy.sh 2>/dev/null || true ; set +u ; build_targets' 2>&1 || true)"
# 以上脚本因为 deploy.sh 顶带 set -uo pipefail 且需要 docker，不好直接 source，就用 deploy.sh build --dry-run 不可用，用 python 单独验证 discover_buildable_services 输出：
python3 - <<'PY'
import subprocess, yaml
raw = subprocess.run(["bash","-lc","cd /opt/f1ink && docker compose config"], capture_output=True, text=True).stdout
d = yaml.safe_load(raw)
names = [n for n,s in (d.get('services') or {}).items() if isinstance(s,dict) and 'build' in s]
print(f"[python direct verify] buildable services from compose = {names}")
PY

echo ""
echo "== 7. 冒烟一遍 deploy --no-fetch --no-build (确认 SMOKE_PATHS 走默认值，6 条路径全 OK，速查表打出来) =="
./deploy.sh deploy --no-fetch --no-build 2>&1 | tail -40
RC=$?
echo "deploy RC=$RC"
exit $RC
