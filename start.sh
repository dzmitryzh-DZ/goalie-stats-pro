#!/bin/bash
# ────────────────────────────────────────────────────────────
#  🥅 Goalie Stats Pro — умный запуск приложения
#
#  Делает:
#    1. Проверяет Node.js (>= 18) и выбирает пакетный менеджер
#    2. Ставит зависимости, если их нет или lock/package изменились
#    3. Находит свободный порт (5173, иначе следующий)
#    4. Поднимает dev-сервер и открывает браузер, когда он готов
#    5. Аккуратно всё убивает по Ctrl+C
# ────────────────────────────────────────────────────────────

set -uo pipefail
cd "$(cd "$(dirname "$0")" && pwd)" || exit 1

APP_NAME="🥅 Goalie Stats Pro"
BASE_PORT=5173
MIN_NODE=18

# Цвета
if [ -t 1 ]; then
  G=$'\033[0;32m'; Y=$'\033[1;33m'; R=$'\033[0;31m'; B=$'\033[1;34m'; N=$'\033[0m'
else
  G=""; Y=""; R=""; B=""; N=""
fi

line() { printf '%s\n' "────────────────────────────────────────"; }
ok()   { printf '%s\n' "${G}✓${N} $*"; }
warn() { printf '%s\n' "${Y}⚠${N} $*"; }
die()  { printf '%s\n' "${R}✗ $*${N}" >&2; line; printf 'Нажмите Enter, чтобы закрыть окно... '; read -r _; exit 1; }

printf '\n%s\n' "${B}${APP_NAME}${N}"
line

# ── 1. Node.js ──────────────────────────────────────────────
command -v node &>/dev/null || die "Node.js не найден. Установите: https://nodejs.org (нужна версия ${MIN_NODE}+)"
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
[ "$NODE_MAJOR" -ge "$MIN_NODE" ] 2>/dev/null || die "Node.js $(node -v) слишком старый — нужна версия ${MIN_NODE}+ (https://nodejs.org)"
ok "Node.js $(node -v)"

# Пакетный менеджер: pnpm (предпочтительно, есть lock-файл) → npm
if command -v pnpm &>/dev/null; then
  PKG="pnpm"; ok "Пакетный менеджер: pnpm $(pnpm -v 2>/dev/null)"
elif command -v npm &>/dev/null; then
  PKG="npm"; warn "pnpm не найден — использую npm"
else
  die "Не найдены ни pnpm, ни npm. Установите pnpm: npm install -g pnpm"
fi

# ── 2. Зависимости (с авто-обновлением при смене lock/package) ─
STAMP="node_modules/.goalie-install-stamp"
needs_install() {
  [ ! -d node_modules ] && return 0
  [ ! -f "$STAMP" ] && return 0
  # эталон = mtime штампа минус 2 сек (запас на округление),
  # файлы новее эталона → переставляем
  REF=$(mktemp); ST=$(stat -f %m "$STAMP" 2>/dev/null || stat -c %Y "$STAMP" 2>/dev/null || echo 0)
  touch -t "$(date -r $((ST - 2)) +%Y%m%d%H%M.%S 2>/dev/null || echo 200001010000.00)" "$REF" 2>/dev/null || REF="$STAMP"
  local r=1
  [ package.json -nt "$REF" ] && r=0
  { [ -f pnpm-lock.yaml ] && [ pnpm-lock.yaml -nt "$REF" ]; } && r=0
  { [ ! -f pnpm-lock.yaml ] && [ -f package-lock.json ] && [ package-lock.json -nt "$REF" ]; } && r=0
  rm -f "$REF"
  return $r
}

if needs_install; then
  printf '\n%s\n' "${Y}📦 Установка зависимостей (первый запуск или package.json изменился)...${N}"
  if [ "$PKG" = "pnpm" ]; then
    pnpm install --cache-dir ./.pnpm-cache || die "pnpm install завершился с ошибкой"
  else
    npm install || die "npm install завершился с ошибкой"
  fi
  touch "$STAMP"
  ok "Зависимости установлены"
else
  ok "Зависимости актуальны"
fi

# ── 3. Свободный порт ───────────────────────────────────────
port_free() { ! lsof -nP -iTCP:"$1" -sTCP:LISTEN &>/dev/null; }

PORT=""
for p in $(seq "$BASE_PORT" $((BASE_PORT + 9))); do
  if port_free "$p"; then PORT=$p; break; fi
  # порт занят — возможно, наше приложение уже работает: откроем его
  if curl -sf -m 2 "http://localhost:$p" 2>/dev/null | grep -qi "Goalie Stats"; then
    warn "Приложение уже запущено на http://localhost:$p — открываю его"
    open "http://localhost:$p" 2>/dev/null || true
    exit 0
  fi
done
[ -n "$PORT" ] || die "Порты ${BASE_PORT}–$((BASE_PORT + 9)) заняты чем-то другим"
[ "$PORT" != "$BASE_PORT" ] && warn "Порт $BASE_PORT занят — беру $PORT"
URL="http://localhost:$PORT"

# ── 4. Запуск dev-сервера + автооткрытие браузера ───────────
# Запускаем vite через exec: `pnpm run dev -- --port ...` в pnpm 11
# прокидывает аргументы неверно (два дэша уходят в vite).
if [ "$PKG" = "pnpm" ]; then
  RUN=(pnpm exec vite --port "$PORT" --strictPort)
else
  RUN=(npx --no-install vite --port "$PORT" --strictPort)
fi

cleanup() {
  trap - INT TERM EXIT
  [ -n "${SERVER_PID:-}" ] && kill "$SERVER_PID" 2>/dev/null
  wait "$SERVER_PID" 2>/dev/null
  printf '\n%s\n' "${G}Сервер остановлен. Пока! 🏒${N}"
  exit 0
}
trap cleanup INT TERM

printf '\n%s\n' "${G}🚀 Запускаю сервер на ${URL} ...${N}"
printf '%s\n' "   Ctrl+C — остановить"
line

"${RUN[@]}" &
SERVER_PID=$!

# Ждём готовности сервера (до 40 сек), потом открываем браузер
(
  for _ in $(seq 1 80); do
    curl -sf -m 2 -o /dev/null "$URL" && break
    kill -0 "$SERVER_PID" 2>/dev/null || exit 1
    sleep 0.5
  done
  open "$URL" 2>/dev/null || xdg-open "$URL" 2>/dev/null || true
) &

# Ждём сервер; если он умер — не даём окну закрыться мгновенно
wait "$SERVER_PID"
EXIT=$?
printf '\n'
warn "Dev-сервер завершился (код $EXIT)."
printf 'Нажмите Enter, чтобы закрыть окно... '; read -r _
exit $EXIT
