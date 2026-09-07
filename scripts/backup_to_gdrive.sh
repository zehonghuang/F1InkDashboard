#!/bin/bash
# =============================================================================
# F1Ink EC2 定时备份脚本
# 目标：压缩 /dev/nvme0n1 (根盘) + /dev/nvme1n1p1 (数据盘) 核心内容
#       上传到 /mnt/gdrive (Google Drive via rclone)
# 调度：北京时间 04:00 = UTC 20:00 (前一天)
# =============================================================================
set -eo pipefail

# ---------- 基础配置 ----------
ENV_FILE="/opt/f1ink/.env"
BACKUP_ROOT="/opt/f1ink/backup"
GDRIVE_MOUNT="/mnt/gdrive"
GDRIVE_BACKUP_DIR="${GDRIVE_MOUNT}/F1Ink-EC2-Backups"
COMPRESS_JOBS=$(nproc)
if command -v pigz >/dev/null 2>&1; then
    COMPRESSOR="pigz -p${COMPRESS_JOBS}"
    COMPRESSOR_NAME="pigz(${COMPRESS_JOBS}c)"
else
    COMPRESSOR="gzip"
    COMPRESSOR_NAME="gzip"
fi

# 北京时间 = UTC+8，脚本文件名以北京时间标注
DATE_BJ=$(TZ='Asia/Shanghai' date +%Y%m%d)
TS_BJ=$(TZ='Asia/Shanghai' date +%Y%m%d_%H%M%S)
LOG_FILE="${BACKUP_ROOT}/backup_${TS_BJ}.log"

# 保留策略（本地 + gdrive）
KEEP_LOCAL_DAYS=3
KEEP_GDRIVE_DAYS=30

# ---------- 日志函数 ----------
log() { echo "[$(TZ='Asia/Shanghai' date +%Y-%m-%d\ %H:%M:%S)] $*" | tee -a "$LOG_FILE"; }
die() { log "ERROR: $*"; exit 1; }

# ---------- 准备 ----------
mkdir -p "$BACKUP_ROOT"
: > "$LOG_FILE"
log "===== 备份开始: ${TS_BJ} (北京时间) ====="
log "UTC time: $(date -u '+%Y-%m-%d %H:%M:%S')"
log "备份工作目录: ${BACKUP_ROOT}"
log "压缩程序: ${COMPRESSOR_NAME}"

# 加载 .env (脱敏加载，只取需要的)
[ -f "$ENV_FILE" ] || die ".env 文件不存在: ${ENV_FILE}"
set -a; . "$ENV_FILE"; set +a
DB_ROOT_PASS="${TOINC_F1_MYSQL_PASSWORD}"
[ -n "$DB_ROOT_PASS" ] || die "TOINC_F1_MYSQL_PASSWORD 未在 .env 中定义"

# 检查 gdrive 挂载
[ -d "$GDRIVE_MOUNT" ] || die "Google Drive 未挂载: ${GDRIVE_MOUNT}"
mountpoint -q "$GDRIVE_MOUNT" || die "Google Drive 挂载失败: ${GDRIVE_MOUNT} 不是挂载点"
mkdir -p "$GDRIVE_BACKUP_DIR" || die "无法创建 gdrive 备份目录"

# 临时工作区（放数据盘 /mnt/data 下，空间足够）
WORK_DIR="/mnt/data/.backup_tmp_${TS_BJ}"
mkdir -p "$WORK_DIR"
cleanup() {
    rm -rf "$WORK_DIR"
    log "临时目录已清理: ${WORK_DIR}"
}
trap cleanup EXIT

# =============================================================================
# 1. MySQL 逻辑导出（优先 - 保证一致性）
# =============================================================================
MYSQL_DUMP="${WORK_DIR}/mysql-all-databases_${DATE_BJ}.sql.gz"
log "--- [1/5] MySQL 全库逻辑导出 -> ${MYSQL_DUMP} ---"
sudo docker exec toinc-f1-mysql mysqldump \
    -uroot -p"${DB_ROOT_PASS}" \
    --single-transaction --routines --triggers --events \
    --all-databases --quick --lock-tables=false \
    2>>"$LOG_FILE" \
  | ${COMPRESSOR} -c > "$MYSQL_DUMP"
DUMP_SIZE=$(du -h "$MYSQL_DUMP" | cut -f1)
log "MySQL 导出完成，文件大小: ${DUMP_SIZE}"

# =============================================================================
# 2. 根盘 /dev/nvme0n1 核心内容归档
#    来源: /opt/f1ink + /home/ec2-user + /etc 关键配置
# =============================================================================
ROOT_TAR="${BACKUP_ROOT}/f1ink-root-core_${DATE_BJ}.tar.gz"
log "--- [2/5] 根盘(/dev/nvme1n1p1) 核心内容 -> ${ROOT_TAR} ---"
ROOT_TAR_RC=0
shopt -s nullglob dotglob
ROOT_BAK_ENV=(/opt/f1ink/.env.bak.*)
ROOT_BAK_COMPOSE=(/opt/f1ink/docker-compose.yml.bak.*)
EC2_HOME_SH=(/home/ec2-user/*.sh)
EC2_HOME_LOG=(/home/ec2-user/*.log)
ROOT_INCLUDES=(
    opt/f1ink/.env
    opt/f1ink/docker-compose.yml
    opt/f1ink/deploy.sh
    opt/f1ink/reload-nginx.sh
    opt/f1ink/nginx
    opt/f1ink/static/mp_config
    opt/f1ink/logs
    opt/f1ink/scripts
    opt/f1ink/backend
    home/ec2-user/.acme.sh
    home/ec2-user/.config/f1ink
    home/ec2-user/.config/rclone
    home/ec2-user/.ssh
    home/ec2-user/.bashrc.f1ink
    home/ec2-user/.bash_history
    home/ec2-user/.docker
    etc/systemd/system/rclone-gdrive.service
    etc/fstab
)
for f in "${ROOT_BAK_ENV[@]}";     do ROOT_INCLUDES+=("${f#/}"); done
for f in "${ROOT_BAK_COMPOSE[@]}"; do ROOT_INCLUDES+=("${f#/}"); done
for f in "${EC2_HOME_SH[@]}";      do ROOT_INCLUDES+=("${f#/}"); done
for f in "${EC2_HOME_LOG[@]}";     do ROOT_INCLUDES+=("${f#/}"); done
shopt -u nullglob dotglob
tar -cf "$ROOT_TAR" \
    --use-compress-program="${COMPRESSOR}" \
    --exclude='/opt/f1ink/src/.git' \
    --exclude='/opt/f1ink/backup' \
    --exclude='/opt/f1ink/logs/*access.log*' \
    --exclude='/home/ec2-user/.cache' \
    --exclude='/home/ec2-user/.npm' \
    --warning=no-file-changed \
    -C / \
    "${ROOT_INCLUDES[@]}" \
    2>>"$LOG_FILE" || ROOT_TAR_RC=$?
if [ $ROOT_TAR_RC -eq 0 ] || [ $ROOT_TAR_RC -eq 1 ] || [ $ROOT_TAR_RC -eq 2 ]; then
    log "[INFO] 根盘 tar exit=${ROOT_TAR_RC} (0=ok/1=文件变更/2=缺失项被跳过，均视为可接受)"
else
    die "根盘 tar 失败 (exit=$ROOT_TAR_RC)，检查日志 ${LOG_FILE}"
fi
[ -s "$ROOT_TAR" ] || die "根盘归档未生成或为空: ${ROOT_TAR}"
ROOT_SIZE=$(du -h "$ROOT_TAR" | cut -f1)
log "根盘核心归档完成，大小: ${ROOT_SIZE}"

# =============================================================================
# 3. 数据盘 /dev/nvme1n1p1 (/mnt/data) 核心内容归档
#    - 除 MySQL datadir（已逻辑导出）与 import（19G 原始dump，可选）
# =============================================================================
DATA_TAR="${BACKUP_ROOT}/f1ink-data-core_${DATE_BJ}.tar.gz"
log "--- [3/5] 数据盘(/dev/nvme0n1) 核心内容 -> ${DATA_TAR} ---"
DATA_TAR_RC=0
shopt -s nullglob dotglob
DATA_INCLUDES=()
for d in mysql-conf redis import; do
    [ -e "/mnt/data/$d" ] && DATA_INCLUDES+=("$d")
done
shopt -u nullglob dotglob
tar -cf "$DATA_TAR" \
    --use-compress-program="${COMPRESSOR}" \
    --exclude='.backup_tmp_*' \
    --warning=no-file-changed \
    -C /mnt/data \
    "${DATA_INCLUDES[@]}" \
    2>>"$LOG_FILE" || DATA_TAR_RC=$?
if [ $DATA_TAR_RC -eq 0 ] || [ $DATA_TAR_RC -eq 1 ] || [ $DATA_TAR_RC -eq 2 ]; then
    log "[INFO] 数据盘 tar exit=${DATA_TAR_RC} (0=ok/1=文件变更/2=缺失项被跳过，均视为可接受)"
else
    die "数据盘 tar 失败 (exit=$DATA_TAR_RC)，检查日志 ${LOG_FILE}"
fi
[ -s "$DATA_TAR" ] || die "数据盘归档未生成或为空: ${DATA_TAR}"
DATA_SIZE=$(du -h "$DATA_TAR" | cut -f1)
log "数据盘核心归档完成，大小: ${DATA_SIZE}"

# =============================================================================
# 4. 把 MySQL dump 单独放一份到备份根（可选：便于快速下载）
# =============================================================================
MYSQL_TAR="${BACKUP_ROOT}/mysql-all-databases_${DATE_BJ}.sql.gz"
cp -f "$MYSQL_DUMP" "$MYSQL_TAR"
log "--- [4/5] MySQL dump 复制到备份目录 ---"

# =============================================================================
# 5. 上传到 Google Drive (/mnt/gdrive/F1Ink-EC2-Backups/<日期>/)
# =============================================================================
GDRIVE_TODAY="${GDRIVE_BACKUP_DIR}/${DATE_BJ}"
log "--- [5/5] 上传到 Google Drive: ${GDRIVE_TODAY} ---"
mkdir -p "$GDRIVE_TODAY"

for f in "$ROOT_TAR" "$DATA_TAR" "$MYSQL_TAR"; do
    fname=$(basename "$f")
    log "  上传中: ${fname} ..."
    cp -f "$f" "${GDRIVE_TODAY}/${fname}"
    fsize=$(du -h "$f" | cut -f1)
    log "    完成 -> ${fsize}"
done
# 上传日志
cp -f "$LOG_FILE" "${GDRIVE_TODAY}/backup_${TS_BJ}.log"

# =============================================================================
# 6. 清理过期备份（本地 3 天 + gdrive 30 天）
# =============================================================================
log "--- 清理过期备份 ---"
# 本地保留最近 3 天（含今天）
find "$BACKUP_ROOT" -maxdepth 1 -type f \
    \( -name 'f1ink-*.tar.gz' -o -name 'mysql-*.sql.gz' -o -name 'backup_*.log' \) \
    -mtime +${KEEP_LOCAL_DAYS} -delete -print 2>>"$LOG_FILE" | while read -r line; do log "  删除本地旧文件: $line"; done

# gdrive 保留最近 30 天的日期目录
find "$GDRIVE_BACKUP_DIR" -maxdepth 1 -type d -mtime +${KEEP_GDRIVE_DAYS} \
    ! -path "$GDRIVE_BACKUP_DIR" 2>/dev/null | while read -r olddir; do
    log "  删除 gdrive 旧目录: $olddir"
    rm -rf "$olddir"
done

# =============================================================================
# 总结
# =============================================================================
TOTAL_LOCAL=$(du -sh "$BACKUP_ROOT" | cut -f1)
TOTAL_GDRIVE=$(du -sh "${GDRIVE_TODAY}" 2>/dev/null | cut -f1 || echo "N/A")
log "===== 备份完成 ====="
log "  北京时间标签 : ${DATE_BJ}"
log "  根盘归档     : ${ROOT_SIZE}  (${ROOT_TAR})"
log "  数据盘归档   : ${DATA_SIZE}  (${DATA_TAR})"
log "  MySQL 导出   : ${DUMP_SIZE}  (${MYSQL_TAR})"
log "  本地总大小   : ${TOTAL_LOCAL} (保留${KEEP_LOCAL_DAYS}天)"
log "  已上传到 GDrive: ${GDRIVE_TODAY} (大小约 ${TOTAL_GDRIVE}, 保留${KEEP_GDRIVE_DAYS}天)"
log "  日志文件     : ${LOG_FILE}"
exit 0
