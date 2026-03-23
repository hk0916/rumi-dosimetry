#!/bin/bash
# ============================================================
# Dosimetry DB Backup Script
# 사용법:
#   ./scripts/backup.sh              # 수동 백업
#   ./scripts/backup.sh --daily      # 일별 백업 (7일 보관)
#   ./scripts/backup.sh --weekly     # 주별 백업 (4주 보관)
#   ./scripts/backup.sh --restore <file>  # 백업 복원
# ============================================================

set -euo pipefail

# 설정
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="${PROJECT_DIR}/backups"
CONTAINER="dosimetry-db"
DB_NAME="dosimetry"
DB_USER="dosimetry_user"
DB_PASS="dosimetry_pass_2026"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# 백업 디렉토리 생성
mkdir -p "${BACKUP_DIR}/daily"
mkdir -p "${BACKUP_DIR}/weekly"
mkdir -p "${BACKUP_DIR}/manual"

# 색상
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[BACKUP]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# Docker 컨테이너 확인
check_container() {
  if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
    error "DB container '${CONTAINER}' is not running."
  fi
}

# 백업 실행
do_backup() {
  local TYPE="${1:-manual}"
  local DIR="${BACKUP_DIR}/${TYPE}"
  local FILENAME="dosimetry_${TYPE}_${TIMESTAMP}.sql.gz"
  local FILEPATH="${DIR}/${FILENAME}"

  check_container

  log "Starting ${TYPE} backup..."
  log "Target: ${FILEPATH}"

  docker exec "${CONTAINER}" mysqldump \
    -u"${DB_USER}" -p"${DB_PASS}" \
    --single-transaction \
    --routines \
    --triggers \
    --set-gtid-purged=OFF \
    "${DB_NAME}" 2>/dev/null | gzip > "${FILEPATH}"

  local SIZE=$(du -h "${FILEPATH}" | cut -f1)
  log "Backup completed: ${FILENAME} (${SIZE})"

  # 테이블 카운트 확인
  local TABLE_COUNT=$(docker exec "${CONTAINER}" mysql \
    -u"${DB_USER}" -p"${DB_PASS}" -N -e \
    "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='${DB_NAME}';" 2>/dev/null)
  log "Tables backed up: ${TABLE_COUNT}"

  echo "${FILEPATH}"
}

# 오래된 백업 정리
cleanup() {
  local TYPE="$1"
  local KEEP_DAYS="$2"
  local DIR="${BACKUP_DIR}/${TYPE}"

  local COUNT=$(find "${DIR}" -name "*.sql.gz" -mtime +"${KEEP_DAYS}" | wc -l | tr -d ' ')
  if [ "${COUNT}" -gt 0 ]; then
    find "${DIR}" -name "*.sql.gz" -mtime +"${KEEP_DAYS}" -delete
    log "Cleaned up ${COUNT} old ${TYPE} backup(s) (>${KEEP_DAYS} days)"
  fi
}

# 복원
do_restore() {
  local FILEPATH="$1"

  if [ ! -f "${FILEPATH}" ]; then
    error "Backup file not found: ${FILEPATH}"
  fi

  check_container

  warn "This will OVERWRITE the current database!"
  read -p "Are you sure? (yes/no): " CONFIRM
  if [ "${CONFIRM}" != "yes" ]; then
    log "Restore cancelled."
    exit 0
  fi

  log "Restoring from: ${FILEPATH}"

  if [[ "${FILEPATH}" == *.gz ]]; then
    gunzip -c "${FILEPATH}" | docker exec -i "${CONTAINER}" mysql \
      -u"${DB_USER}" -p"${DB_PASS}" "${DB_NAME}" 2>/dev/null
  else
    docker exec -i "${CONTAINER}" mysql \
      -u"${DB_USER}" -p"${DB_PASS}" "${DB_NAME}" < "${FILEPATH}" 2>/dev/null
  fi

  log "Restore completed successfully."
}

# 백업 목록
list_backups() {
  log "Available backups:"
  echo ""
  for TYPE in manual daily weekly; do
    local DIR="${BACKUP_DIR}/${TYPE}"
    echo "  [${TYPE}]"
    if ls "${DIR}"/*.sql.gz 1>/dev/null 2>&1; then
      ls -lh "${DIR}"/*.sql.gz | awk '{print "    " $9 " (" $5 ", " $6 " " $7 ")"}'
    else
      echo "    (none)"
    fi
    echo ""
  done
}

# 메인
case "${1:-}" in
  --daily)
    do_backup "daily"
    cleanup "daily" 7
    ;;
  --weekly)
    do_backup "weekly"
    cleanup "weekly" 28
    ;;
  --restore)
    if [ -z "${2:-}" ]; then
      error "Usage: $0 --restore <backup_file>"
    fi
    do_restore "$2"
    ;;
  --list)
    list_backups
    ;;
  *)
    do_backup "manual"
    ;;
esac
