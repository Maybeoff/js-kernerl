# JS Kernel - Ядро ОС на JavaScript

Минимальная реализация ядра операционной системы на JavaScript для образовательных целей.

## Архитектура

- `os/kernel.js` - ядро ОС (бинарник)
- `os/bin/shell.js` - интерпретатор команд
- `os/bin/` - утилиты и программы (cat, ls, mkdir, ps, meminfo)
- `run.sh` - скрипт для запуска на Linux

## Компоненты ядра

- **Менеджер процессов** - создание, планирование и завершение процессов
- **Менеджер памяти** - выделение и освобождение памяти (страничная организация)
- **Файловая система** - виртуальная ФС с директориями и файлами
- **Планировщик** - Round-robin планирование процессов
- **Обработчик прерываний** - система прерываний и исключений

## Запуск

### Запуск ядра с shell (по умолчанию)

```bash
./run.sh
```

или

```bash
node os/kernel.js ./os/bin/shell.js
```

### Запуск ядра без программ

```bash
node os/kernel.js
```

### Запуск ядра с другой программой

```bash
./run.sh ./os/bin/ls.js /
./run.sh ./os/bin/cat.js /etc/hostname
./run.sh ./os/bin/ps.js
```

или напрямую:

```bash
node os/kernel.js ./os/bin/ls.js /
node os/kernel.js ./os/bin/cat.js /etc/hostname
node os/kernel.js ./os/bin/ps.js
```

## Команды Shell

- `help` - показать справку по командам
- `ls [path]` - список файлов и директорий
- `cat <file>` - показать содержимое файла
- `echo <text>` - вывести текст
- `touch <file>` - создать пустой файл
- `mkdir <dir>` - создать директорию
- `cd <dir>` - сменить директорию
- `pwd` - показать текущую директорию
- `ps` - список активных процессов
- `meminfo` - информация о памяти
- `nano <file>` - редактировать файл (текстовый редактор)
- `exit` - завершить работу

## Конфигурация

### Синхронизация папок

В `run.sh` можно настроить двустороннюю синхронизацию реальных папок с виртуальной ФС:

```bash
# Синхронизация папок (реальная_папка:виртуальная_папка)
export SYNC_DIRS="./os/bin:/bin,./data:/data,./config:/etc/config"
```

**Как работает синхронизация:**

- **Гость → Хост**: Файлы созданные или измененные в виртуальной ФС автоматически сохраняются на реальный диск
- **Хост → Гость**: Файлы созданные или измененные на диске автоматически видны в виртуальной ФС
- Синхронизация происходит в реальном времени при каждой операции чтения/записи

**Пример:**

```bash
# В shell
jskernel:/ $ cd /bin
jskernel:/bin $ touch myfile.txt
jskernel:/bin $ nano myfile.txt
# Файл сохраняется в ./os/bin/myfile.txt на хосте

# На хосте
$ echo "Hello" > os/bin/hostfile.txt

# В shell
jskernel:/bin $ cat hostfile.txt
Hello
```

### Редактор nano

Встроенный текстовый редактор с базовыми функциями:

**Горячие клавиши:**
- `Ctrl+S` - сохранить файл
- `Ctrl+X` - выход (с запросом сохранения если есть изменения)
- `Ctrl+K` - вырезать текущую строку
- `Ctrl+U` - вставить вырезанную строку
- `↑/↓` - навигация по строкам
- `Enter` - новая строка
- `Backspace` - удалить символ/строку

**Использование:**

```bash
jskernel:/ $ nano /home/myfile.txt
# Редактируем файл
# Ctrl+S для сохранения
# Ctrl+X для выхода
```

Ядро предоставляет следующие системные вызовы:

- `open(path, mode)` - открыть файл
- `read(fd, length)` - читать из файла
- `write(fd, data)` - писать в файл
- `close(fd)` - закрыть файл
- `fork(pid)` - создать дочерний процесс
- `exit(pid, code)` - завершить процесс
- `malloc(size, pid)` - выделить память
- `free(blockId)` - освободить память
- `ps()` - список процессов
- `ls(path)` - список файлов
- `meminfo()` - информация о памяти

## Пример использования

```bash
$ ./run.sh
Shell started

jskernel:/ $ ls
Contents of /:
drwxr-xr-x        0 bin
drwxr-xr-x        0 etc
drwxr-xr-x        0 home
drwxr-xr-x        0 tmp

jskernel:/ $ cd /home
jskernel:/home $ touch myfile.txt
File myfile.txt created

jskernel:/home $ nano myfile.txt
# Редактируем файл, добавляем текст
# Ctrl+S для сохранения, Ctrl+X для выхода

jskernel:/home $ cat myfile.txt
Hello from JS Kernel!

jskernel:/home $ ls
Contents of /home:
-rwxr-xr-x       22 myfile.txt

jskernel:/home $ ps
PID  NAME           STATE      PRIORITY
---  ----           -----      --------
1    init           ready      1

jskernel:/home $ meminfo
Memory Information:
Total:     1048576 bytes
Used:      0 bytes
Free:      1048576 bytes
Pages:     0/256 used

jskernel:/home $ cd /bin
jskernel:/bin $ ls
Contents of /bin:
-rwxr-xr-x      562 cat.js
-rwxr-xr-x      115 echo.js
-rwxr-xr-x      592 ls.js
-rwxr-xr-x      607 meminfo.js
-rwxr-xr-x      486 mkdir.js
-rwxr-xr-x     5655 nano.js
-rwxr-xr-x      587 ps.js
-rwxr-xr-x     8764 shell.js
-rwxr-xr-x      525 touch.js

jskernel:/bin $ exit
Shutting down...
```

## Особенности

- **Виртуальная файловая система** - все файлы хранятся в памяти, но синхронизируются с диском для указанных папок
- **Планировщик процессов** - Round-robin с временными квантами 100ms
- **Управление памятью** - страничная организация (4KB страницы, 1MB всего)
- **Системные вызовы** - полноценный API для работы с ФС, процессами и памятью
- **Двусторонняя синхронизация** - изменения в гостевой ФС сохраняются на диск и наоборот

## Структура файлов

```
.
├── run.sh             # Скрипт запуска с конфигурацией
├── os/
│   ├── kernel.js      # Ядро ОС (процессы, память, ФС, планировщик, прерывания)
│   └── bin/
│       ├── shell.js   # Интерпретатор команд
│       ├── nano.js    # Текстовый редактор
│       ├── cat.js     # Утилита cat
│       ├── echo.js    # Утилита echo
│       ├── ls.js      # Утилита ls
│       ├── touch.js   # Утилита touch
│       ├── mkdir.js   # Утилита mkdir
│       ├── ps.js      # Утилита ps
│       └── meminfo.js # Утилита meminfo
└── README.md
```

## Архитектура

### Ядро (os/kernel.js)

Содержит все основные компоненты ОС:

- **ProcessManager** - управление процессами (создание, fork, exit)
- **MemoryManager** - управление памятью (страничная организация, malloc/free)
- **FileSystem** - виртуальная ФС с синхронизацией на диск
- **Scheduler** - планировщик процессов (Round-robin)
- **InterruptHandler** - обработка прерываний

### Shell (os/bin/shell.js)

Интерпретатор команд, работающий в одном процессе с ядром. Команды выполняются через системные вызовы.

### Утилиты (os/bin/)

Отдельные программы, которые могут быть запущены ядром. Каждая утилита экспортирует функцию `run(kernel, args)`.

## Разработка

### Добавление новой команды в shell

Отредактируйте `os/bin/shell.js`:

```javascript
// Добавьте в builtins
this.builtins = {
    // ...
    'mycommand': this.mycommand.bind(this)
};

// Добавьте метод
mycommand(args) {
    console.log('My command executed!');
}
```

### Создание новой утилиты

Создайте файл `os/bin/myutil.js`:

```javascript
#!/usr/bin/env node

function run(kernel, args) {
    // Используйте kernel.syscall() для работы с ФС
    const files = kernel.syscall('ls', '/');
    console.log(files);
}

module.exports = { run };
```

### Добавление новой синхронизируемой папки

Отредактируйте `run.sh`:

```bash
export SYNC_DIRS="./os/bin:/bin,./mydata:/data"
```
