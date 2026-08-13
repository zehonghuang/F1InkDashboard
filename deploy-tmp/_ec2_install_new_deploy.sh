#!/bin/bash
set -uo pipefail
cd /opt/f1ink

# ===== 先验证新脚本语法 =====
echo "== 1. bash -n syntax check (新脚本) =="
bash -n /tmp/deploy.sh.new || exit 1
echo "OK"

# ===== 替换 =====
echo "== 2. backup old deploy.sh =="
TS=$(date +%Y%m%d-%H%M%S)
cp deploy.sh "scripts/deploy.sh.bak.enhance-before-$TS"
cp deploy.sh "scripts/deploy.sh.bak.enhance-before-latest"
ls -la scripts/deploy.sh.bak.* | tail -5

echo "== 3. 覆盖 deploy.sh 为增强版 + chmod =="
cp /tmp/deploy.sh.new deploy.sh
chmod +x deploy.sh
echo "new deploy.sh size=$(wc -c < deploy.sh)"

echo ""
echo "== 4. ./deploy.sh --help =="
./deploy.sh --help | head -30

echo ""
echo "== 5. ./deploy.sh check-config (验证 docker compose config OK) =="
./deploy.sh check-config > /tmp/checkcfg.yaml 2>&1
RC=$?
echo "RC=$RC"
if [ $RC -eq 0 ]; then
  echo "docker compose config OK. services list:"
  python3 -c "
import yaml, sys
d = yaml.safe_load(open('/tmp/checkcfg.yaml'))
print(list(d.get('services', {}).keys()))
"
else
  echo "FAILED —— 打印前 40 行错误："
  head -40 /tmp/checkcfg.yaml
  exit 2
fi

echo ""
echo "== 6. ./deploy.sh deploy --only admin-v2 --no-fetch (确保 src/admin-v2 代码不会变，只为跑流程) =="
./deploy.sh deploy --only admin-v2 --no-fetch 2>&1 | tail -n 50
RC=$?
echo "deploy --only admin-v2 RC=$RC"
exit $RC
