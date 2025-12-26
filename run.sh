#!/bin/bash
# JS Kernel launcher script

# Конфигурация синхронизации папок (реальная_папка:виртуальная_папка)
export SYNC_DIRS="./os/:/"

# Если передан параметр, запускаем ядро с программой
if [ $# -gt 0 ]; then
    node ./os/kernel.js "$@"
else
    # Иначе запускаем ядро с shell
    node ./os/kernel.js ./os/bin/shell.js
fi
