# Руководство по написанию программ для JS Kernel

## Базовая структура программы

Каждая программа для JS Kernel должна экспортировать функцию `run`, которая принимает три параметра:

```javascript
#!/usr/bin/env node
/**
 * Описание программы
 */

function run(kernel, args, currentDir) {
    // Ваш код здесь
}

module.exports = { run };
```

### Параметры функции run

- **kernel** - экземпляр ядра, предоставляет доступ к системным вызовам
- **args** - массив аргументов командной строки (без имени команды)
- **currentDir** - текущая рабочая директория в виртуальной ФС

## Системные вызовы (syscall)

Все операции с файловой системой, процессами и памятью выполняются через `kernel.syscall()`:

### Работа с файлами

#### open(path, mode)
Открывает файл и возвращает файловый дескриптор.

```javascript
const fd = kernel.syscall('open', '/home/file.txt', 'r');  // чтение
const fd = kernel.syscall('open', '/home/file.txt', 'w');  // запись
const fd = kernel.syscall('open', '/home/file.txt', 'a');  // добавление
```

#### read(fd, length)
Читает данные из файла.

```javascript
const fd = kernel.syscall('open', '/home/file.txt', 'r');
let content = '';
let chunk;
do {
    chunk = kernel.syscall('read', fd, 64 * 1024);
    content += chunk;
} while (chunk.length > 0);
kernel.syscall('close', fd);
console.log(content);
```

#### write(fd, data)
Записывает данные в файл.

```javascript
const fd = kernel.syscall('open', '/home/file.txt', 'w');
kernel.syscall('write', fd, 'Hello, World!\n');
kernel.syscall('close', fd);
```

#### close(fd)
Закрывает файл.

```javascript
kernel.syscall('close', fd);
```

#### ls(path)
Возвращает список файлов и директорий.

```javascript
const files = kernel.syscall('ls', '/home');
files.forEach(file => {
    console.log(`${file.name} (${file.type})`);
});
```

### Работа с процессами

#### ps()
Возвращает список процессов.

```javascript
const processes = kernel.syscall('ps');
processes.forEach(proc => {
    console.log(`PID: ${proc.pid}, Name: ${proc.name}, State: ${proc.state}`);
});
```

#### fork(pid)
Создает дочерний процесс (копию родительского).

```javascript
const childPid = kernel.syscall('fork', parentPid);
```

#### exit(pid, code)
Завершает процесс с кодом возврата.

```javascript
kernel.syscall('exit', pid, 0);
```

### Работа с памятью

#### malloc(size, processId)
Выделяет блок памяти.

```javascript
const blockId = kernel.syscall('malloc', 4096, processId);
```

#### free(blockId)
Освобождает блок памяти.

```javascript
kernel.syscall('free', blockId);
```

#### meminfo()
Возвращает информацию о памяти.

```javascript
const memInfo = kernel.syscall('meminfo');
console.log(`Total: ${memInfo.total} bytes`);
console.log(`Used: ${memInfo.used} bytes`);
console.log(`Free: ${memInfo.free} bytes`);
```

## Работа с путями

### Преобразование относительных путей в абсолютные

```javascript
function run(kernel, args, currentDir) {
    let filepath = args[0];
    
    if (!filepath.startsWith('/')) {
        // Относительный путь - преобразуем в абсолютный
        if (currentDir === '/') {
            filepath = '/' + filepath;
        } else {
            filepath = currentDir + '/' + filepath;
        }
    }
    
    // Теперь filepath - абсолютный путь
    const fd = kernel.syscall('open', filepath, 'r');
    // ...
}
```

## Примеры программ

### Пример 1: Простая программа echo

```javascript
#!/usr/bin/env node
/**
 * echo - выводит текст
 */

function run(kernel, args, currentDir) {
    console.log(args.join(' '));
}

module.exports = { run };
```

### Пример 2: Программа для чтения файла

```javascript
#!/usr/bin/env node
/**
 * cat - показывает содержимое файла
 */

function run(kernel, args, currentDir) {
    if (!args[0]) {
        console.log('Usage: cat <filename>');
        return;
    }

    try {
        // Преобразуем относительный путь
        let filepath = args[0];
        if (!filepath.startsWith('/')) {
            if (currentDir === '/') {
                filepath = '/' + filepath;
            } else {
                filepath = currentDir + '/' + filepath;
            }
        }

        // Читаем файл
        const fd = kernel.syscall('open', filepath, 'r');
        let content = '';
        let chunk;
        do {
            chunk = kernel.syscall('read', fd, 64 * 1024);
            content += chunk;
        } while (chunk.length > 0);
        kernel.syscall('close', fd);
        
        console.log(content);
    } catch (error) {
        console.error(`cat: ${error.message}`);
    }
}

module.exports = { run };
```

### Пример 3: Программа для создания файла

```javascript
#!/usr/bin/env node
/**
 * touch - создает пустой файл
 */

function run(kernel, args, currentDir) {
    if (!args[0]) {
        console.log('Usage: touch <filename>');
        return;
    }

    try {
        let filepath = args[0];
        if (!filepath.startsWith('/')) {
            if (currentDir === '/') {
                filepath = '/' + filepath;
            } else {
                filepath = currentDir + '/' + filepath;
            }
        }

        const fd = kernel.syscall('open', filepath, 'w');
        kernel.syscall('close', fd);
        console.log(`File ${args[0]} created`);
    } catch (error) {
        console.error(`touch: ${error.message}`);
    }
}

module.exports = { run };
```

### Пример 4: Программа для работы со списком файлов

```javascript
#!/usr/bin/env node
/**
 * listfiles - показывает файлы с их размерами
 */

function run(kernel, args, currentDir) {
    const path = args[0] || currentDir;
    
    try {
        const files = kernel.syscall('ls', path);
        
        console.log(`Files in ${path}:`);
        console.log('');
        
        files.forEach(file => {
            const type = file.type === 'directory' ? 'DIR ' : 'FILE';
            const size = file.size.toString().padStart(8);
            console.log(`${type} ${size} ${file.name}`);
        });
        
        console.log('');
        console.log(`Total: ${files.length} items`);
    } catch (error) {
        console.error(`listfiles: ${error.message}`);
    }
}

module.exports = { run };
```

### Пример 5: Программа для записи в файл

```javascript
#!/usr/bin/env node
/**
 * writefile - записывает текст в файл
 */

function run(kernel, args, currentDir) {
    if (args.length < 2) {
        console.log('Usage: writefile <filename> <text...>');
        return;
    }

    try {
        let filepath = args[0];
        const text = args.slice(1).join(' ');
        
        // Преобразуем путь
        if (!filepath.startsWith('/')) {
            if (currentDir === '/') {
                filepath = '/' + filepath;
            } else {
                filepath = currentDir + '/' + filepath;
            }
        }

        // Записываем в файл
        const fd = kernel.syscall('open', filepath, 'w');
        kernel.syscall('write', fd, text + '\n');
        kernel.syscall('close', fd);
        
        console.log(`Written to ${args[0]}`);
    } catch (error) {
        console.error(`writefile: ${error.message}`);
    }
}

module.exports = { run };
```

### Пример 6: Асинхронная программа

Если ваша программа использует асинхронные операции, верните Promise:

```javascript
#!/usr/bin/env node
/**
 * asyncapp - пример асинхронной программы
 */

async function run(kernel, args, currentDir) {
    console.log('Starting async operation...');
    
    // Имитация асинхронной операции
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log('Async operation completed!');
}

module.exports = { run };
```

## Размещение программ

### Вариант 1: В папке os/etc/

Поместите файл программы в `os/etc/` и она будет доступна автоматически:

```bash
# Создаем файл
nano os/etc/myapp.js

# Запускаем из shell
jskernel:/ $ myapp arg1 arg2
```

### Вариант 2: Используя команду define

Разместите программу где угодно и создайте алиас:

```bash
jskernel:/ $ define myapp ./path/to/myapp.js
Command 'myapp' defined as './path/to/myapp.js'

jskernel:/ $ myapp arg1 arg2
```

### Вариант 3: Прямой запуск через ядро

```bash
./run.sh ./path/to/myapp.js arg1 arg2
```

или

```bash
node os/kernel.js ./path/to/myapp.js arg1 arg2
```

## Доступ к файловой системе ядра

Вы можете напрямую обращаться к объектам ядра:

```javascript
function run(kernel, args, currentDir) {
    // Прямой доступ к файловой системе
    kernel.fileSystem.mkdir('/mydir');
    kernel.fileSystem.writeFile('/mydir/file.txt', 'content');
    
    // Прямой доступ к менеджеру процессов
    const pid = kernel.processManager.createProcess('myproc', () => {
        console.log('Process running');
    });
    
    // Прямой доступ к памяти
    const blockId = kernel.memoryManager.allocate(4096);
    kernel.memoryManager.free(blockId);
}
```

## Обработка ошибок

Всегда оборачивайте системные вызовы в try-catch:

```javascript
function run(kernel, args, currentDir) {
    try {
        const fd = kernel.syscall('open', '/nonexistent.txt', 'r');
        // ...
    } catch (error) {
        console.error(`Error: ${error.message}`);
        // Не вызывайте process.exit() - это завершит весь kernel!
        return;
    }
}
```

## Важные правила

1. **НЕ используйте `process.exit()`** - это завершит весь kernel, а не только вашу программу
2. **Всегда закрывайте файлы** после работы с ними (`close`)
3. **Проверяйте аргументы** перед использованием
4. **Обрабатывайте ошибки** через try-catch
5. **Используйте относительные пути** - преобразуйте их в абсолютные с помощью `currentDir`
6. **Возвращайте Promise** если программа асинхронная

## Отладка

Для отладки используйте `console.log()`:

```javascript
function run(kernel, args, currentDir) {
    console.log('Debug: args =', args);
    console.log('Debug: currentDir =', currentDir);
    
    try {
        const files = kernel.syscall('ls', currentDir);
        console.log('Debug: files =', files);
    } catch (error) {
        console.error('Debug: error =', error);
    }
}
```

## Полезные шаблоны

### Шаблон для программы с аргументами

```javascript
function run(kernel, args, currentDir) {
    // Проверка количества аргументов
    if (args.length < 1) {
        console.log('Usage: myapp <arg1> [arg2]');
        return;
    }
    
    const arg1 = args[0];
    const arg2 = args[1] || 'default';
    
    // Ваш код
}
```

### Шаблон для работы с файлами

```javascript
function run(kernel, args, currentDir) {
    if (!args[0]) {
        console.log('Usage: myapp <filename>');
        return;
    }
    
    // Преобразование пути
    let filepath = args[0];
    if (!filepath.startsWith('/')) {
        filepath = currentDir === '/' 
            ? '/' + filepath 
            : currentDir + '/' + filepath;
    }
    
    try {
        // Работа с файлом
        const fd = kernel.syscall('open', filepath, 'r');
        // ...
        kernel.syscall('close', fd);
    } catch (error) {
        console.error(`myapp: ${error.message}`);
    }
}
```

### Шаблон для интерактивной программы

```javascript
const readline = require('readline');

async function run(kernel, args, currentDir) {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        rl.question('Enter something: ', (answer) => {
            console.log(`You entered: ${answer}`);
            rl.close();
            resolve();
        });
    });
}
```

## Примеры использования

```bash
# Создаем программу
jskernel:/ $ nano /etc/hello.js

# Запускаем
jskernel:/ $ hello world

# Создаем алиас
jskernel:/ $ define greet /etc/hello.js
jskernel:/ $ greet everyone

# Список всех команд
jskernel:/ $ help
```

## Дополнительные возможности

### Создание директорий

```javascript
kernel.fileSystem.mkdir('/mydir/subdir');
```

### Прямая запись в файл

```javascript
kernel.fileSystem.writeFile('/mydir/file.txt', 'content');
```

### Прямое чтение файла

```javascript
const content = kernel.fileSystem.readFile('/mydir/file.txt');
```

### Получение директории

```javascript
const dir = kernel.fileSystem.getDirectory('/mydir');
if (dir) {
    console.log('Directory exists');
}
```

---

**Удачи в написании программ для JS Kernel!**

[Архитектура проекта ](https://maybeyoou.ru/js-kernerl/ARCHITECTURE)


