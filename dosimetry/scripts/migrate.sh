#!/bin/bash
# ============================================================
# Dosimetry DB Migration Script (Prisma 기반)
# 사용법:
#   ./scripts/migrate.sh init          # 최초 마이그레이션 생성
#   ./scripts/migrate.sh create <name> # 새 마이그레이션 생성
#   ./scripts/migrate.sh deploy        # 마이그레이션 적용
#   ./scripts/migrate.sh status        # 현재 상태 확인
#   ./scripts/migrate.sh reset         # DB 초기화 + 시드 (개발용)
#   ./scripts/migrate.sh seed          # 시드 데이터 실행
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="${PROJECT_DIR}/backend"
CONTAINER="dosimetry-backend"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[MIGRATE]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

check_container() {
  if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
    error "Backend container '${CONTAINER}' is not running."
  fi
}

case "${1:-help}" in
  init)
    check_container
    log "Initializing Prisma migrations..."
    log "This will create the first migration from the current schema."
    docker exec "${CONTAINER}" npx prisma migrate dev --name init
    log "Migration initialized."
    ;;

  create)
    if [ -z "${2:-}" ]; then
      error "Usage: $0 create <migration_name>"
    fi
    check_container
    log "Creating migration: ${2}"
    docker exec "${CONTAINER}" npx prisma migrate dev --name "$2"
    log "Migration created."
    ;;

  deploy)
    check_container
    log "Deploying pending migrations..."

    # 배포 전 자동 백업
    log "Creating pre-migration backup..."
    "${SCRIPT_DIR}/backup.sh" --daily

    docker exec "${CONTAINER}" npx prisma migrate deploy
    log "Migrations deployed."
    ;;

  status)
    check_container
    log "Migration status:"
    docker exec "${CONTAINER}" npx prisma migrate status
    ;;

  reset)
    check_container
    warn "This will DROP all tables and re-create them!"
    read -p "Are you sure? (yes/no): " CONFIRM
    if [ "${CONFIRM}" != "yes" ]; then
      log "Reset cancelled."
      exit 0
    fi

    # 리셋 전 백업
    log "Creating pre-reset backup..."
    "${SCRIPT_DIR}/backup.sh"

    log "Resetting database..."
    docker exec "${CONTAINER}" npx prisma db push --force-reset
    log "Running seed..."
    docker exec "${CONTAINER}" npx prisma db seed
    log "Database reset completed."
    ;;

  seed)
    check_container
    log "Running seed data..."
    docker exec "${CONTAINER}" npx prisma db seed
    log "Seed completed."
    ;;

  push)
    check_container
    log "Pushing schema to database (no migration file)..."
    docker exec "${CONTAINER}" npx prisma db push
    log "Schema pushed."
    ;;

  generate)
    check_container
    log "Generating Prisma client..."
    docker exec "${CONTAINER}" npx prisma generate
    log "Client generated."
    ;;

  help|*)
    echo ""
    echo "Dosimetry DB Migration Tool"
    echo ""
    echo "Usage: $0 <command> [args]"
    echo ""
    echo "Commands:"
    echo "  init              Create first migration from current schema"
    echo "  create <name>     Create a new migration"
    echo "  deploy            Apply pending migrations (auto-backup first)"
    echo "  status            Show migration status"
    echo "  reset             Reset DB + seed (DESTRUCTIVE, dev only)"
    echo "  seed              Run seed data"
    echo "  push              Push schema without migration file"
    echo "  generate          Regenerate Prisma client"
    echo ""
    echo "Migration Strategy:"
    echo "  Development:  schema.prisma 수정 → ./scripts/migrate.sh create <name>"
    echo "  Staging:      ./scripts/migrate.sh deploy"
    echo "  Production:   ./scripts/migrate.sh deploy (자동 백업 포함)"
    echo ""
    ;;
esac
