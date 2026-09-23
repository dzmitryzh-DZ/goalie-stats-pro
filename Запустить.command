#!/bin/bash
# Двойной клик в Finder = запуск Goalie Stats Pro.
# Раскрываем путь (Finder запускает .command не из своей папки) и
# гарантируем бит выполнения у start.sh на случай сброса атрибутов.
DIR="$(cd "$(dirname "$0")" && pwd)"
chmod +x "$DIR/start.sh" 2>/dev/null
exec /bin/bash "$DIR/start.sh"
