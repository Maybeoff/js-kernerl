/**
 * Минимальное ядро ОС на JavaScript
 * Образовательная реализация основных компонентов
 */

// ============================================================================
// ПРОЦЕССЫ
// ============================================================================

class Process {
    constructor(pid, name, func, priority = 1) {
        this.pid = pid;
        this.name = name;
        this.func = func;
        this.priority = priority;
        this.state = 'ready'; // ready, running, blocked, terminated
        this.parentPid = null;
        this.exitCode = null;
        this.createdAt = Date.now();
        this.cpuTime = 0;
    }

    run() {
        if (this.state !== 'ready') return;
        
        this.state = 'running';
        const startTime = Date.now();
        
        try {
            this.func();
        } catch (error) {
            console.error(`Process ${this.name} crashed:`, error);
            this.state = 'terminated';
            this.exitCode = -1;
        }
        
        this.cpuTime += Date.now() - startTime;
        
        if (this.state === 'running') {
            this.state = 'ready';
        }
    }
}

class ProcessManager {
    constructor() {
        this.processes = new Map();
        this.nextPid = 1;
        this.currentProcess = null;
    }

    createProcess(name, func, priority = 1) {
        const pid = this.nextPid++;
        const process = new Process(pid, name, func, priority);
        
        this.processes.set(pid, process);
        //console.log(`Process created: ${name} (PID: ${pid})`);
        
        return pid;
    }

    fork(parentPid) {
        const parent = this.processes.get(parentPid);
        if (!parent) {
            throw new Error(`Process ${parentPid} not found`);
        }

        const childPid = this.createProcess(
            `${parent.name}_child`, 
            parent.func, 
            parent.priority
        );
        
        const child = this.processes.get(childPid);
        child.parentPid = parentPid;
        
        return childPid;
    }

    exit(pid, exitCode = 0) {
        const process = this.processes.get(pid);
        if (!process) return false;

        process.state = 'terminated';
        process.exitCode = exitCode;
        
        //console.log(`Process ${process.name} (${pid}) exited with code ${exitCode}`);
        
        setTimeout(() => {
            this.processes.delete(pid);
        }, 1000);
        
        return true;
    }

    killAll() {
        for (const [pid, process] of this.processes) {
            if (process.state === 'running') {
                this.exit(pid, -1);
            }
        }
    }

    getProcess(pid) {
        return this.processes.get(pid);
    }

    listProcesses() {
        const processList = [];
        for (const [pid, process] of this.processes) {
            processList.push({
                pid,
                name: process.name,
                state: process.state,
                priority: process.priority,
                parentPid: process.parentPid
            });
        }
        return processList;
    }
}

// ============================================================================
// ПАМЯТЬ
// ============================================================================

class MemoryManager {
    constructor() {
        this.totalMemory = 1024 * 1024; // 1MB
        this.pageSize = 4096; // 4KB страницы
        this.pages = new Map();
        this.freePages = [];
        this.allocatedBlocks = new Map();
        this.nextBlockId = 1;
    }

    initialize() {
        const totalPages = Math.floor(this.totalMemory / this.pageSize);
        
        for (let i = 0; i < totalPages; i++) {
            this.freePages.push(i);
            this.pages.set(i, {
                id: i,
                allocated: false,
                process: null,
                data: new ArrayBuffer(this.pageSize)
            });
        }
        
        //console.log(`Memory initialized: ${totalPages} pages (${this.totalMemory} bytes)`);
    }

    allocate(size, processId = null) {
        const pagesNeeded = Math.ceil(size / this.pageSize);
        
        if (this.freePages.length < pagesNeeded) {
            throw new Error('Out of memory');
        }

        const allocatedPages = [];
        for (let i = 0; i < pagesNeeded; i++) {
            const pageId = this.freePages.pop();
            const page = this.pages.get(pageId);
            
            page.allocated = true;
            page.process = processId;
            allocatedPages.push(pageId);
        }

        const blockId = this.nextBlockId++;
        this.allocatedBlocks.set(blockId, {
            id: blockId,
            size,
            pages: allocatedPages,
            process: processId,
            allocatedAt: Date.now()
        });

        return blockId;
    }

    free(blockId) {
        const block = this.allocatedBlocks.get(blockId);
        if (!block) {
            throw new Error(`Block ${blockId} not found`);
        }

        for (const pageId of block.pages) {
            const page = this.pages.get(pageId);
            page.allocated = false;
            page.process = null;
            
            const view = new Uint8Array(page.data);
            view.fill(0);
            
            this.freePages.push(pageId);
        }

        this.allocatedBlocks.delete(blockId);
        return true;
    }

    getMemoryInfo() {
        const totalPages = this.pages.size;
        const freePages = this.freePages.length;
        const usedPages = totalPages - freePages;
        
        return {
            total: this.totalMemory,
            used: usedPages * this.pageSize,
            free: freePages * this.pageSize,
            pages: { total: totalPages, used: usedPages, free: freePages }
        };
    }
}

// ============================================================================
// ФАЙЛОВАЯ СИСТЕМА
// ============================================================================

class File {
    constructor(name, data = '') {
        this.name = name;
        this.type = 'file';
        this.data = data;
        this.createdAt = Date.now();
        this.modifiedAt = Date.now();
    }
}

class Directory {
    constructor(name) {
        this.name = name;
        this.type = 'directory';
        this.children = new Map();
        this.createdAt = Date.now();
    }
}

class FileSystem {
    constructor() {
        this.root = new Directory('/');
        this.currentDir = this.root;
        this.openFiles = new Map();
        this.nextFileDescriptor = 3;
        this.syncMappings = new Map(); // виртуальный путь -> реальный путь
    }

    mount() {
        this.mkdir('/bin');
        this.mkdir('/etc');
        this.mkdir('/home');
        this.mkdir('/tmp');
        
        this.writeFile('/etc/passwd', 'root:x:0:0:root:/root:/bin/bash\n');
        this.writeFile('/etc/hostname', 'jskernel\n');
        
        // Синхронизация реальных папок из переменной окружения
        const syncDirs = process.env.SYNC_DIRS || '';
        if (syncDirs) {
            syncDirs.split(',').forEach(pair => {
                const [realPath, virtualPath] = pair.split(':');
                if (realPath && virtualPath) {
                    this.syncRealDirectory(realPath.trim(), virtualPath.trim());
                }
            });
        }
    }
    
    syncRealDirectory(realPath, virtualPath) {
        const fs = require('fs');
        const path = require('path');
        
        // Сохраняем маппинг для синхронизации
        this.syncMappings.set(virtualPath, realPath);
        
        try {
            const files = fs.readdirSync(realPath);
            
            files.forEach(file => {
                const fullPath = path.join(realPath, file);
                const stat = fs.statSync(fullPath);
                
                if (stat.isDirectory()) {
                    this.mkdir(virtualPath + '/' + file);
                    this.syncRealDirectory(fullPath, virtualPath + '/' + file);
                } else if (stat.isFile()) {
                    const content = fs.readFileSync(fullPath, 'utf8');
                    this.writeFile(virtualPath + '/' + file, content);
                }
            });
        } catch (error) {
            // Игнорируем ошибки синхронизации
        }
    }
    
    // Проверяем нужна ли синхронизация для пути
    getSyncPath(virtualPath) {
        const fs = require('fs');
        const path = require('path');
        
        // Ищем подходящий маппинг
        for (const [vPath, rPath] of this.syncMappings) {
            if (virtualPath.startsWith(vPath)) {
                // Заменяем виртуальный путь на реальный
                const relativePath = virtualPath.substring(vPath.length);
                return path.join(rPath, relativePath);
            }
        }
        return null;
    }

    mkdir(path) {
        const parts = this.parsePath(path);
        let current = this.root;
        
        for (const part of parts) {
            if (!current.children.has(part)) {
                current.children.set(part, new Directory(part));
            }
            current = current.children.get(part);
        }
        
        // Синхронизация с реальной ФС
        const realPath = this.getSyncPath(path);
        if (realPath) {
            const fs = require('fs');
            try {
                if (!fs.existsSync(realPath)) {
                    fs.mkdirSync(realPath, { recursive: true });
                }
            } catch (error) {
                // Игнорируем ошибки синхронизации
            }
        }
        
        return true;
    }

    writeFile(path, data) {
        const { dir, filename } = this.parseFilePath(path);
        const directory = this.getDirectory(dir);
        
        if (!directory) {
            throw new Error(`Directory not found: ${dir}`);
        }
        
        const file = new File(filename, data);
        directory.children.set(filename, file);
        
        // Синхронизация с реальной ФС
        const realPath = this.getSyncPath(path);
        if (realPath) {
            const fs = require('fs');
            try {
                fs.writeFileSync(realPath, data, 'utf8');
            } catch (error) {
                // Игнорируем ошибки синхронизации
            }
        }
        
        return true;
    }

    readFile(path) {
        // Сначала пробуем прочитать из реальной ФС
        const realPath = this.getSyncPath(path);
        if (realPath) {
            const fs = require('fs');
            try {
                const data = fs.readFileSync(realPath, 'utf8');
                // Обновляем виртуальную ФС
                const { dir, filename } = this.parseFilePath(path);
                const directory = this.getDirectory(dir);
                if (directory) {
                    const file = new File(filename, data);
                    directory.children.set(filename, file);
                }
                return data;
            } catch (error) {
                // Файл не существует в реальной ФС, читаем из виртуальной
            }
        }
        
        // Читаем из виртуальной ФС
        const { dir, filename } = this.parseFilePath(path);
        const directory = this.getDirectory(dir);
        
        if (!directory) {
            throw new Error(`Directory not found: ${dir}`);
        }
        
        const file = directory.children.get(filename);
        if (!file || file.type !== 'file') {
            throw new Error(`File not found: ${path}`);
        }
        
        return file.data;
    }

    open(path, mode = 'r') {
        const fd = this.nextFileDescriptor++;
        
        try {
            const data = this.readFile(path);
            this.openFiles.set(fd, { path, mode, data, position: 0 });
            return fd;
        } catch (error) {
            if (mode.includes('w') || mode.includes('a')) {
                this.writeFile(path, '');
                return this.open(path, mode);
            }
            throw error;
        }
    }

    read(fd, length) {
        const file = this.openFiles.get(fd);
        if (!file) throw new Error(`Invalid file descriptor: ${fd}`);
        
        const start = file.position;
        const end = Math.min(start + length, file.data.length);
        const result = file.data.slice(start, end);
        
        file.position = end;
        return result;
    }

    write(fd, data) {
        const file = this.openFiles.get(fd);
        if (!file) throw new Error(`Invalid file descriptor: ${fd}`);
        
        if (!file.mode.includes('w') && !file.mode.includes('a')) {
            throw new Error('File not open for writing');
        }
        
        if (file.mode.includes('a')) {
            file.data += data;
        } else {
            const before = file.data.slice(0, file.position);
            const after = file.data.slice(file.position + data.length);
            file.data = before + data + after;
        }
        
        file.position += data.length;
        this.writeFile(file.path, file.data);
        return data.length;
    }

    close(fd) {
        return this.openFiles.delete(fd);
    }

    ls(path = '.') {
        // Сначала синхронизируем с реальной ФС
        const realPath = this.getSyncPath(path);
        if (realPath) {
            const fs = require('fs');
            try {
                const files = fs.readdirSync(realPath);
                const directory = this.getDirectory(path);
                
                if (directory) {
                    // Очищаем старые записи
                    directory.children.clear();
                    
                    // Добавляем актуальные файлы
                    files.forEach(file => {
                        const fullPath = require('path').join(realPath, file);
                        const stat = fs.statSync(fullPath);
                        
                        if (stat.isDirectory()) {
                            directory.children.set(file, new Directory(file));
                        } else if (stat.isFile()) {
                            const content = fs.readFileSync(fullPath, 'utf8');
                            directory.children.set(file, new File(file, content));
                        }
                    });
                }
            } catch (error) {
                // Игнорируем ошибки синхронизации
            }
        }
        
        const directory = this.getDirectory(path);
        if (!directory) throw new Error(`Directory not found: ${path}`);
        
        const entries = [];
        for (const [name, entry] of directory.children) {
            entries.push({
                name,
                type: entry.type,
                size: entry.type === 'file' ? entry.data.length : 0
            });
        }
        return entries;
    }

    parsePath(path) {
        return path.split('/').filter(part => part.length > 0);
    }

    parseFilePath(path) {
        const parts = this.parsePath(path);
        const filename = parts.pop();
        const dir = '/' + parts.join('/');
        return { dir: dir === '/' ? '/' : dir, filename };
    }

    getDirectory(path) {
        if (path === '/' || path === '') return this.root;
        
        const parts = this.parsePath(path);
        let current = this.root;
        
        for (const part of parts) {
            const child = current.children.get(part);
            if (!child || child.type !== 'directory') {
                return null;
            }
            current = child;
        }
        return current;
    }
}

// ============================================================================
// ПЛАНИРОВЩИК
// ============================================================================

class Scheduler {
    constructor() {
        this.processQueue = [];
        this.isRunning = false;
        this.timeSlice = 100;
        this.currentProcess = null;
        this.schedulerInterval = null;
    }

    start() {
        if (this.isRunning) return;
        
        this.isRunning = true;
        this.schedulerInterval = setInterval(() => {
            this.schedule();
        }, this.timeSlice);
        
        //console.log('Scheduler started');
    }

    stop() {
        if (!this.isRunning) return;
        
        this.isRunning = false;
        if (this.schedulerInterval) {
            clearInterval(this.schedulerInterval);
            this.schedulerInterval = null;
        }
        
        //console.log('Scheduler stopped');
    }

    addProcess(process) {
        if (process.state === 'ready') {
            this.processQueue.push(process);
        }
    }

    schedule() {
        if (this.processQueue.length === 0) return;

        const process = this.processQueue.shift();
        
        if (process.state === 'ready') {
            this.currentProcess = process;
            process.run();
            
            if (process.state === 'ready') {
                this.processQueue.push(process);
            }
        }
        
        this.currentProcess = null;
    }
}

// ============================================================================
// ПРЕРЫВАНИЯ
// ============================================================================

class InterruptHandler {
    constructor() {
        this.handlers = new Map();
        this.enabled = false;
        this.interruptQueue = [];
        this.isProcessing = false;
    }

    enable() {
        this.enabled = true;
        
        this.registerHandler(0, this.handleException.bind(this));
        this.registerHandler(1, this.handleKeyboard.bind(this));
        this.registerHandler(2, this.handleTimer.bind(this));
        this.registerHandler(3, this.handleSystemCall.bind(this));
        
        //console.log('Interrupt handler enabled');
    }

    registerHandler(interruptNumber, handler) {
        this.handlers.set(interruptNumber, handler);
    }

    trigger(interruptNumber, data = null) {
        if (!this.enabled) return false;

        this.interruptQueue.push({
            number: interruptNumber,
            data,
            timestamp: Date.now()
        });
        
        if (!this.isProcessing) {
            this.processInterrupts();
        }
        return true;
    }

    async processInterrupts() {
        if (this.isProcessing) return;
        
        this.isProcessing = true;
        while (this.interruptQueue.length > 0) {
            const interrupt = this.interruptQueue.shift();
            const handler = this.handlers.get(interrupt.number);
            
            if (handler) {
                try {
                    await handler(interrupt.data);
                } catch (error) {
                    console.error(`Error in interrupt handler:`, error);
                }
            }
        }
        this.isProcessing = false;
    }

    handleException(data) {
        console.error('Exception:', data);
    }

    handleKeyboard(data) {
        //console.log('Keyboard:', data);
    }

    handleTimer(data) {
        //console.log('Timer interrupt');
    }

    handleSystemCall(data) {
        //console.log('System call:', data);
    }
}

// ============================================================================
// ЯДРО
// ============================================================================

class Kernel {
    constructor() {
        this.isRunning = false;
        this.processManager = new ProcessManager();
        this.memoryManager = new MemoryManager();
        this.fileSystem = new FileSystem();
        this.scheduler = new Scheduler();
        this.interruptHandler = new InterruptHandler();
        
        //console.log('Kernel initialized');
    }

    boot() {
        //bonsole.log('Booting kernel...');
        
        this.memoryManager.initialize();
        this.fileSystem.mount();
        this.scheduler.start();
        this.interruptHandler.enable();
        
        this.isRunning = true;
        //console.log('Kernel boot complete');
        
        this.processManager.createProcess('init', this.initProcess.bind(this));
    }

    shutdown() {
        //console.log('Shutting down kernel...');
        this.scheduler.stop();
        this.processManager.killAll();
        this.isRunning = false;
        //console.log('Kernel shutdown complete');
    }

    initProcess() {
        //console.log('Init process started');
        this.processManager.createProcess('shell', () => {
            //console.log('Shell started');
        });
    }

    syscall(type, ...args) {
        switch(type) {
            case 'write':
                return this.fileSystem.write(...args);
            case 'read':
                return this.fileSystem.read(...args);
            case 'open':
                return this.fileSystem.open(...args);
            case 'close':
                return this.fileSystem.close(...args);
            case 'fork':
                return this.processManager.fork(...args);
            case 'exit':
                return this.processManager.exit(...args);
            case 'malloc':
                return this.memoryManager.allocate(...args);
            case 'free':
                return this.memoryManager.free(...args);
            case 'ps':
                return this.processManager.listProcesses();
            case 'ls':
                return this.fileSystem.ls(...args);
            case 'meminfo':
                return this.memoryManager.getMemoryInfo();
            default:
                throw new Error(`Unknown syscall: ${type}`);
        }
    }

// Глобальный экземпляр ядра
    static instance = null;
    
    static getInstance() {
        if (!Kernel.instance) {
            Kernel.instance = new Kernel();
        }
        return Kernel.instance;
    }
}

// Запуск ядра если вызван напрямую
if (require.main === module) {
    const path = require('path');
    const args = process.argv.slice(2);
    
    const kernel = Kernel.getInstance();
    kernel.boot();
    
    if (args.length === 0) {
        // Если нет параметров, просто запускаем ядро
        //console.log('Kernel running. Press Ctrl+C to shutdown.');
        // Ядро продолжает работать
    } else {
        // Запускаем указанные программы
        let programPath = args[0];
        
        // Если путь относительный, преобразуем в абсолютный
        if (!path.isAbsolute(programPath)) {
            programPath = path.resolve(process.cwd(), programPath);
        }
        
        const programArgs = args.slice(1);
        
        try {
            // Очищаем кэш модуля перед загрузкой
            delete require.cache[programPath];
            
            // Динамически загружаем программу
            const program = require(programPath);
            if (program.run) {
                // Передаем kernel в run функцию
                program.run(kernel, programArgs);
            }
        } catch (error) {
            console.error(`Error loading program: ${error.message}`);
            process.exit(1);
        }
    }
}

module.exports = { Kernel };