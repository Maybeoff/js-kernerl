# Архитектура JS Kernel

Подробное описание внутреннего устройства ядра операционной системы.

## Общая архитектура

```
┌─────────────────────────────────────────────────────────────┐
│                         User Space                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐     │
│  │  Shell   │  │   nano   │  │   cat    │  │  Custom  │     │
│  │          │  │          │  │          │  │   Apps   │     │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘     │
│       │             │             │             │           │
│       └─────────────┴─────────────┴─────────────┘           │
│                                                             │
│                    syscall()                                │
└──────────────────────────┼──────────────────────────────────┘
                           │
┌──────────────────────────┼──────────────────────────────────┐
│                    Kernel Space                             │
│                          │                                  │
│              ┌───────────▼───────────┐                      │
│              │   Kernel (Singleton)  │                      │
│              │   - syscall()         │                      │
│              │   - boot()            │                      │
│              │   - shutdown()        │                      │
│              └───────────┬───────────┘                      │
│                          │                                  │
│       ┌──────────────────┼──────────────────┐               │
│       │                  │                  │               │
│   ┌───▼────┐      ┌──────▼──────┐    ┌─────▼─────┐          │
│   │Process │      │   Memory    │    │   File    │          │
│   │Manager │      │   Manager   │    │  System   │          │
│   └───┬────┘      └──────┬──────┘    └─────┬─────┘          │
│       │                  │                  │               │
│   ┌───▼────┐      ┌──────▼──────┐          │                │
│   │Scheduler│     │   Pages     │          │                │
│   └────────┘      │   (4KB)     │          │                │
│                   └─────────────┘          │                │
│   ┌────────────┐                    ┌──────▼──────┐         │
│   │ Interrupt  │                    │  Real FS    │         │
│   │  Handler   │                    │  Sync       │         │
│   └────────────┘                    └─────────────┘         │
└─────────────────────────────────────────────────────────────┘
```

## Компоненты ядра

### 1. Kernel (Главный класс)

**Назначение**: Центральный координатор всех подсистем ОС.

**Структура**:
```javascript
class Kernel {
    constructor() {
        this.isRunning = false
        this.processManager = new ProcessManager()
        this.memoryManager = new MemoryManager()
        this.fileSystem = new FileSystem()
        this.scheduler = new Scheduler()
        this.interruptHandler = new InterruptHandler()
    }
}
```

**Методы**:
- `boot()` - инициализация всех подсистем
- `shutdown()` - корректное завершение работы
- `syscall(type, ...args)` - единая точка входа для системных вызовов

**Паттерн**: Singleton (один экземпляр на процесс Node.js)

```
┌─────────────────────────────────────┐
│           Kernel Instance           │
├─────────────────────────────────────┤
│ + boot()                            │
│ + shutdown()                        │
│ + syscall(type, ...args)            │
│                                     │
│ - processManager                    │
│ - memoryManager                     │
│ - fileSystem                        │
│ - scheduler                         │
│ - interruptHandler                  │
└─────────────────────────────────────┘
```

---

### 2. ProcessManager (Управление процессами)

**Назначение**: Создание, отслеживание и завершение процессов.

**Структура процесса**:
```
┌──────────────────────────────┐
│         Process              │
├──────────────────────────────┤
│ pid: number                  │
│ name: string                 │
│ state: 'ready'|'running'|... │
│ priority: number             │
│ parentPid: number|null       │
│ exitCode: number|null        │
│ cpuTime: number              │
│ func: Function               │
└──────────────────────────────┘
```

**Состояния процесса**:
```
    ┌─────────┐
    │  ready  │◄─────┐
    └────┬────┘      │
         │           │
         ▼           │
    ┌─────────┐      │
    │ running │──────┘
    └────┬────┘
         │
         ▼
    ┌───────────┐
    │terminated │
    └───────────┘
```

**Операции**:
- `createProcess(name, func, priority)` - создание нового процесса
- `fork(parentPid)` - клонирование процесса
- `exit(pid, code)` - завершение процесса
- `listProcesses()` - список всех процессов

**Хранение**: `Map<pid, Process>`

---

### 3. MemoryManager (Управление памятью)

**Назначение**: Выделение и освобождение памяти с использованием страничной организации.

**Архитектура памяти**:
```
Total Memory: 1MB (1048576 bytes)
Page Size: 4KB (4096 bytes)
Total Pages: 256

┌─────────────────────────────────────┐
│         Memory Layout               │
├─────────────────────────────────────┤
│ Page 0   │ 4KB │ [allocated/free]   │
│ Page 1   │ 4KB │ [allocated/free]   │
│ Page 2   │ 4KB │ [allocated/free]   │
│   ...    │ ... │       ...          │
│ Page 255 │ 4KB │ [allocated/free]   │
└─────────────────────────────────────┘
```

**Структура страницы**:
```javascript
{
    id: number,           // Номер страницы
    allocated: boolean,   // Выделена ли
    process: number|null, // PID владельца
    data: ArrayBuffer     // Данные (4KB)
}
```

**Выделение памяти**:
```
Request: malloc(12KB)
         ↓
Calculate pages needed: ceil(12KB / 4KB) = 3 pages
         ↓
Find 3 free pages: [5, 6, 7]
         ↓
Mark as allocated
         ↓
Return blockId: 42
```

**Операции**:
- `allocate(size, processId)` - выделить блок памяти
- `free(blockId)` - освободить блок
- `getMemoryInfo()` - статистика использования

**Хранение**:
- `pages: Map<pageId, Page>` - все страницы
- `freePages: Array<pageId>` - свободные страницы
- `allocatedBlocks: Map<blockId, Block>` - выделенные блоки

---

### 4. FileSystem (Файловая система)

**Назначение**: Виртуальная иерархическая ФС с синхронизацией на диск.

**Структура**:
```
Root (/)
├── bin/          (Directory)
│   ├── shell.js  (File)
│   └── ls.js     (File)
├── etc/          (Directory)
│   ├── cat.js    (File)
│   ├── nano.js   (File)
│   └── passwd    (File)
├── home/         (Directory)
│   └── user/     (Directory)
└── tmp/          (Directory)
```

**Классы**:

```
┌──────────────────┐         ┌──────────────────┐
│   Directory      │         │      File        │
├──────────────────┤         ├──────────────────┤
│ name: string     │         │ name: string     │
│ type: 'directory'│         │ type: 'file'     │
│ children: Map    │         │ data: string     │
│ createdAt: Date  │         │ createdAt: Date  │
└──────────────────┘         │ modifiedAt: Date │
                             └──────────────────┘
```

**Файловые дескрипторы**:
```javascript
{
    fd: 3,                    // Номер дескриптора
    path: '/home/file.txt',   // Путь к файлу
    mode: 'r',                // Режим (r/w/a)
    data: 'content...',       // Содержимое
    position: 0               // Текущая позиция
}
```

**Синхронизация с реальной ФС**:
```
Virtual FS          Sync Mapping          Real FS
─────────────────────────────────────────────────
/bin/        ←──→   ./os/bin:/bin   ←──→  ./os/bin/
/etc/        ←──→   ./os/etc:/etc   ←──→  ./os/etc/
/home/       ←──→   ./os/home:/home ←──→  ./os/home/

Операции:
- writeFile() → сохраняет на диск
- readFile()  → читает с диска
- ls()        → синхронизирует перед чтением
```

**Операции**:
- `mount()` - создание базовой структуры
- `mkdir(path)` - создание директории
- `writeFile(path, data)` - запись файла
- `readFile(path)` - чтение файла
- `open(path, mode)` - открыть файл (возвращает fd)
- `read(fd, length)` - читать из fd
- `write(fd, data)` - писать в fd
- `close(fd)` - закрыть fd
- `ls(path)` - список файлов

---

### 5. Scheduler (Планировщик)

**Назначение**: Распределение процессорного времени между процессами.

**Алгоритм**: Round-robin (циклический)

**Работа планировщика**:
```
Time Slice: 100ms

Process Queue: [P1, P2, P3]
                │
                ▼
         ┌──────────────┐
         │ Select P1    │
         │ Run 100ms    │
         └──────┬───────┘
                │
         ┌──────▼───────┐
         │ P1 → end     │
         │ of queue     │
         └──────┬───────┘
                │
         Queue: [P2, P3, P1]
                │
                ▼
         ┌──────────────┐
         │ Select P2    │
         │ Run 100ms    │
         └──────────────┘
                ...
```

**Методы**:
- `start()` - запуск планировщика (setInterval)
- `stop()` - остановка планировщика
- `addProcess(process)` - добавить процесс в очередь
- `schedule()` - выбрать и запустить следующий процесс

**Состояние**:
```javascript
{
    processQueue: [],        // Очередь готовых процессов
    isRunning: boolean,      // Работает ли планировщик
    timeSlice: 100,          // Квант времени (мс)
    currentProcess: null     // Текущий процесс
}
```

---

### 6. InterruptHandler (Обработчик прерываний)

**Назначение**: Обработка асинхронных событий и прерываний.

**Типы прерываний**:
```
0 - Exception    (исключения)
1 - Keyboard     (клавиатура)
2 - Timer        (таймер)
3 - System Call  (системный вызов)
```

**Механизм работы**:
```
Event occurs
     │
     ▼
trigger(interruptNumber, data)
     │
     ▼
Add to interruptQueue
     │
     ▼
processInterrupts()
     │
     ▼
Call registered handler
     │
     ▼
Handler executes
```

**Методы**:
- `enable()` - включить обработку прерываний
- `registerHandler(number, handler)` - зарегистрировать обработчик
- `trigger(number, data)` - вызвать прерывание
- `processInterrupts()` - обработать очередь прерываний

---

## Поток выполнения

### Загрузка ядра

```
1. node os/kernel.js ./os/bin/shell.js
         │
         ▼
2. Kernel.getInstance()
         │
         ▼
3. kernel.boot()
         │
         ├─→ memoryManager.initialize()
         ├─→ fileSystem.mount()
         ├─→ scheduler.start()
         └─→ interruptHandler.enable()
         │
         ▼
4. Load program (shell.js)
         │
         ▼
5. program.run(kernel, args)
         │
         ▼
6. Shell starts readline loop
```

### Выполнение команды

```
User types: "cat /etc/passwd"
         │
         ▼
Shell parses: command="cat", args=["/etc/passwd"]
         │
         ▼
Check builtins? No
         │
         ▼
Check custom commands? No
         │
         ▼
Check local file (./cat)? No
         │
         ▼
Load from /etc: require('./os/etc/cat.js')
         │
         ▼
Execute: cat.run(kernel, ["/etc/passwd"], "/")
         │
         ▼
cat calls: kernel.syscall('open', '/etc/passwd', 'r')
         │
         ▼
Kernel routes to: fileSystem.open(...)
         │
         ▼
FileSystem returns: fd=3
         │
         ▼
cat calls: kernel.syscall('read', 3, 1024)
         │
         ▼
FileSystem returns: "root:x:0:0:..."
         │
         ▼
cat outputs to console
         │
         ▼
Shell shows prompt again
```

### Системный вызов

```
Program: kernel.syscall('open', '/file.txt', 'r')
              │
              ▼
         Kernel.syscall()
              │
              ▼
         switch(type)
              │
              ├─ 'open'   → fileSystem.open()
              ├─ 'read'   → fileSystem.read()
              ├─ 'write'  → fileSystem.write()
              ├─ 'fork'   → processManager.fork()
              ├─ 'malloc' → memoryManager.allocate()
              └─ ...
              │
              ▼
         Return result
```

---

## Взаимодействие компонентов

### Создание процесса

```
┌──────────┐  createProcess()  ┌────────────────┐
│  Kernel  │─────────────────→ │ProcessManager  │
└──────────┘                   └────────┬───────┘
                                        │
                                        │ new Process()
                                        ▼
                               ┌─────────────────┐
                               │   Process       │
                               │   pid: 1        │
                               │   state: ready  │
                               └────────┬────────┘
                                        │
                                        │ addProcess()
                                        ▼
                               ┌─────────────────┐
                               │   Scheduler     │
                               │   queue: [P1]   │
                               └─────────────────┘
```

### Работа с файлом

```
┌──────────┐  syscall('open')  ┌────────────┐
│ Program  │──────────────────→│  Kernel    │
└──────────┘                   └─────┬──────┘
                                     │
                                     │ fileSystem.open()
                                     ▼
                            ┌─────────────────┐
                            │   FileSystem    │
                            └────────┬────────┘
                                     │
                                     │ getSyncPath()
                                     ▼
                            ┌─────────────────┐
                            │   Real FS       │
                            │   fs.readFile() │
                            └────────┬────────┘
                                     │
                                     │ return data
                                     ▼
                            ┌─────────────────┐
                            │ File Descriptor │
                            │ fd: 3           │
                            │ data: "..."     │
                            └─────────────────┘
```

### Выделение памяти

```
┌──────────┐  syscall('malloc')  ┌────────────┐
│ Program  │────────────────────→│  Kernel    │
└──────────┘                     └─────┬──────┘
                                       │
                                       │ memoryManager.allocate()
                                       ▼
                              ┌──────────────────┐
                              │  MemoryManager   │
                              └────────┬─────────┘
                                       │
                                       │ Calculate pages needed
                                       │ Find free pages
                                       │ Mark as allocated
                                       ▼
                              ┌──────────────────┐
                              │  Return blockId  │
                              └──────────────────┘
```

---

## Жизненный цикл

### Процесс

```
Created → Ready → Running → Ready → ... → Terminated
   │        │        │        │              │
   │        │        │        │              │
   └────────┴────────┴────────┴──────────────┘
        Managed by ProcessManager
```

### Файловый дескриптор

```
open() → fd=3 → read()/write() → ... → close() → fd freed
   │             │                        │
   │             │                        │
   └─────────────┴────────────────────────┘
        Tracked in openFiles Map
```

### Блок памяти

```
malloc() → blockId=42 → used by process → free() → pages returned
    │                                        │
    │                                        │
    └────────────────────────────────────────┘
           Tracked in allocatedBlocks
```

---

## Паттерны проектирования

### 1. Singleton (Kernel)
Гарантирует один экземпляр ядра на процесс Node.js.

```javascript
static instance = null;

static getInstance() {
    if (!Kernel.instance) {
        Kernel.instance = new Kernel();
    }
    return Kernel.instance;
}
```

### 2. Facade (syscall)
Единая точка входа для всех системных операций.

```javascript
syscall(type, ...args) {
    switch(type) {
        case 'open': return this.fileSystem.open(...args);
        case 'read': return this.fileSystem.read(...args);
        // ...
    }
}
```

### 3. Strategy (Scheduler)
Разные алгоритмы планирования (сейчас Round-robin).

### 4. Observer (InterruptHandler)
Регистрация и вызов обработчиков событий.

---

## Ограничения и компромиссы

### 1. Однопоточность
- JavaScript однопоточный → нет настоящего параллелизма
- Планировщик симулирует многозадачность

### 2. Память
- Фиксированный размер (1MB)
- Нет виртуальной памяти / swap
- Нет защиты памяти между процессами

### 3. Процессы
- Не настоящие процессы ОС
- Все в одном Node.js процессе
- Нет изоляции

### 4. Файловая система
- Хранится в памяти (RAM)
- Синхронизация опциональна
- Нет прав доступа

### 5. Безопасность
- Нет разделения user/kernel space
- Программы имеют полный доступ к ядру
- Нет песочницы

---

## Расширение системы

### Добавление нового системного вызова

1. Добавить в `Kernel.syscall()`:
```javascript
case 'mynewcall':
    return this.mySubsystem.myMethod(...args);
```

2. Реализовать в подсистеме:
```javascript
class MySubsystem {
    myMethod(arg1, arg2) {
        // implementation
    }
}
```

3. Использовать в программах:
```javascript
kernel.syscall('mynewcall', arg1, arg2);
```

### Добавление новой подсистемы

1. Создать класс:
```javascript
class MySubsystem {
    constructor() { }
    initialize() { }
}
```

2. Добавить в Kernel:
```javascript
constructor() {
    this.mySubsystem = new MySubsystem();
}

boot() {
    this.mySubsystem.initialize();
}
```

3. Добавить syscall (см. выше)

---

## Производительность

### Узкие места

1. **Синхронизация ФС** - операции I/O блокирующие
2. **Планировщик** - setInterval не точный
3. **Память** - копирование ArrayBuffer медленное

### Оптимизации

1. Кэширование файлов в памяти
2. Ленивая синхронизация (только при необходимости)
3. Пул страниц памяти

---

## Отладка

### Включение логов

Раскомментируйте `console.log()` в коде ядра:

```javascript
// Было:
//console.log('Memory initialized');

// Стало:
console.log('Memory initialized');
```

### Инспекция состояния

```javascript
// В программе
console.log('Processes:', kernel.syscall('ps'));
console.log('Memory:', kernel.syscall('meminfo'));
console.log('Files:', kernel.syscall('ls', '/'));
```

### Трассировка syscall

Добавьте в начало `Kernel.syscall()`:

```javascript
syscall(type, ...args) {
    console.log(`[SYSCALL] ${type}`, args);
    // ...
}
```

---

## Дальнейшее развитие

### Возможные улучшения

1. **Сетевой стек** - виртуальные сокеты
2. **Pipe** - передача данных между процессами
3. **Сигналы** - SIGTERM, SIGKILL, SIGUSR1
4. **Права доступа** - chmod, chown
5. **Пользователи** - multi-user support
6. **Устройства** - /dev/null, /dev/random
7. **Монтирование** - mount/umount
8. **Символические ссылки** - ln -s
9. **Фоновые процессы** - & и jobs
10. **Переменные окружения** - export, env

---

**Документация актуальна для версии: 1.0**
