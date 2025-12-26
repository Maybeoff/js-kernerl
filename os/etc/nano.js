#!/usr/bin/env node
/**
 * nano - текстовый редактор для JS Kernel
 */

const readline = require('readline');

class Nano {
    constructor(kernel, filename) {
        this.kernel = kernel;
        this.filename = filename;
        this.lines = [];
        this.currentLine = 0;
        this.cursorX = 0;
        this.scrollY = 0;
        this.modified = false;
        this.cutBuffer = '';
        this.statusMessage = '';
        this.statusTimeout = null;
    }

    async start() {
        return new Promise((resolve) => {
            this.exitResolve = resolve;
            
            // Загружаем файл если существует
            try {
                const fd = this.kernel.syscall('open', this.filename, 'r');
                let content = '';
                let chunk;
                // Читаем файл полностью
                do {
                    chunk = this.kernel.syscall('read', fd, 64 * 1024);
                    content += chunk;
                } while (chunk.length > 0);
                this.kernel.syscall('close', fd);
                
                this.lines = content.split('\n');
                if (this.lines.length === 0) {
                    this.lines = [''];
                }
            } catch (error) {
                // Новый файл
                this.lines = [''];
            }

            // Настройка readline для raw mode
            readline.emitKeypressEvents(process.stdin);
            if (process.stdin.isTTY) {
                process.stdin.setRawMode(true);
            }

            this.render();

            process.stdin.on('keypress', (str, key) => {
                this.handleKey(str, key);
            });

            // Обработка resize
            process.stdout.on('resize', () => {
                this.render();
            });
        });
    }

    render() {
        const rows = process.stdout.rows || 24;
        const cols = process.stdout.columns || 80;
        
        console.clear();
        
        // Header
        const header = `File: ${this.filename}${this.modified ? ' [Modified]' : ''}`;
        console.log(header);
        console.log('─'.repeat(cols));
        
        // Автоскролл
        if (this.currentLine < this.scrollY) {
            this.scrollY = this.currentLine;
        }
        if (this.currentLine >= this.scrollY + rows - 5) {
            this.scrollY = this.currentLine - rows + 6;
        }
        
        // Показываем строки
        const visibleRows = rows - 4; // header + separator + status + help
        for (let i = 0; i < visibleRows; i++) {
            const lineIdx = this.scrollY + i;
            if (lineIdx >= this.lines.length) {
                console.log('~');
                continue;
            }
            
            const line = this.lines[lineIdx];
            const lineNum = (lineIdx + 1).toString().padStart(4, ' ');
            const prefix = lineIdx === this.currentLine ? '>' : ' ';
            
            // Горизонтальный скролл
            let displayLine = line;
            if (line.length > cols - 6) {
                const scrollX = Math.max(0, this.cursorX - cols + 10);
                displayLine = line.substring(scrollX, scrollX + cols - 6);
            }
            
            console.log(`${lineNum}${prefix} ${displayLine}`);
        }
        
        // Status bar
        console.log('─'.repeat(cols));
        const status = this.statusMessage || 
            `Line ${this.currentLine + 1}/${this.lines.length} Col ${this.cursorX + 1}`;
        console.log(status);
        console.log('^S Save  ^X Exit  ^K Cut  ^U Paste  Arrow keys Navigate');
        
        // Позиционируем курсор
        const cursorRow = this.currentLine - this.scrollY + 3; // +3 для header
        const cursorCol = Math.min(this.cursorX, cols - 7) + 6; // +6 для line number
        process.stdout.write(`\x1b[${cursorRow};${cursorCol}H`);
    }

    handleKey(str, key) {
        // Очищаем статус сообщение
        if (this.statusTimeout) {
            clearTimeout(this.statusTimeout);
            this.statusTimeout = null;
        }
        this.statusMessage = '';

        if (key.ctrl && key.name === 'c') {
            this.exit();
            return;
        }

        if (key.ctrl && key.name === 's') {
            this.save();
            return;
        }

        if (key.ctrl && key.name === 'x') {
            if (this.modified) {
                this.statusMessage = 'Save modified buffer? (y/n)';
                this.render();
                
                // Временно отключаем обработчик
                process.stdin.removeAllListeners('keypress');
                process.stdin.once('keypress', (str, key) => {
                    if (key.name === 'y') {
                        this.save();
                    }
                    this.exit();
                });
            } else {
                this.exit();
            }
            return;
        }

        if (key.ctrl && key.name === 'k') {
            // Cut line
            this.cutBuffer = this.lines[this.currentLine];
            this.lines.splice(this.currentLine, 1);
            if (this.lines.length === 0) {
                this.lines = [''];
            }
            if (this.currentLine >= this.lines.length) {
                this.currentLine = this.lines.length - 1;
            }
            this.cursorX = 0;
            this.modified = true;
            this.render();
            return;
        }

        if (key.ctrl && key.name === 'u') {
            // Paste line
            if (this.cutBuffer) {
                this.lines.splice(this.currentLine, 0, this.cutBuffer);
                this.modified = true;
                this.render();
            }
            return;
        }

        // Навигация
        if (key.name === 'up') {
            if (this.currentLine > 0) {
                this.currentLine--;
                this.cursorX = Math.min(this.cursorX, this.lines[this.currentLine].length);
                this.render();
            }
            return;
        }

        if (key.name === 'down') {
            if (this.currentLine < this.lines.length - 1) {
                this.currentLine++;
                this.cursorX = Math.min(this.cursorX, this.lines[this.currentLine].length);
                this.render();
            }
            return;
        }

        if (key.name === 'left') {
            if (this.cursorX > 0) {
                this.cursorX--;
                this.render();
            } else if (this.currentLine > 0) {
                // Переход на предыдущую строку
                this.currentLine--;
                this.cursorX = this.lines[this.currentLine].length;
                this.render();
            }
            return;
        }

        if (key.name === 'right') {
            if (this.cursorX < this.lines[this.currentLine].length) {
                this.cursorX++;
                this.render();
            } else if (this.currentLine < this.lines.length - 1) {
                // Переход на следующую строку
                this.currentLine++;
                this.cursorX = 0;
                this.render();
            }
            return;
        }

        if (key.name === 'home') {
            this.cursorX = 0;
            this.render();
            return;
        }

        if (key.name === 'end') {
            this.cursorX = this.lines[this.currentLine].length;
            this.render();
            return;
        }

        if (key.name === 'return') {
            // Разрезаем строку по курсору
            const currentLine = this.lines[this.currentLine];
            const before = currentLine.substring(0, this.cursorX);
            const after = currentLine.substring(this.cursorX);
            
            this.lines[this.currentLine] = before;
            this.lines.splice(this.currentLine + 1, 0, after);
            this.currentLine++;
            this.cursorX = 0;
            this.modified = true;
            this.render();
            return;
        }

        if (key.name === 'backspace') {
            if (this.cursorX > 0) {
                // Удаляем символ
                const line = this.lines[this.currentLine];
                this.lines[this.currentLine] = 
                    line.substring(0, this.cursorX - 1) + 
                    line.substring(this.cursorX);
                this.cursorX--;
                this.modified = true;
                this.render();
            } else if (this.currentLine > 0) {
                // Объединяем с предыдущей строкой
                const currentText = this.lines[this.currentLine];
                this.lines.splice(this.currentLine, 1);
                this.currentLine--;
                this.cursorX = this.lines[this.currentLine].length;
                this.lines[this.currentLine] += currentText;
                this.modified = true;
                this.render();
            }
            return;
        }

        if (key.name === 'delete') {
            const line = this.lines[this.currentLine];
            if (this.cursorX < line.length) {
                // Удаляем символ справа
                this.lines[this.currentLine] = 
                    line.substring(0, this.cursorX) + 
                    line.substring(this.cursorX + 1);
                this.modified = true;
                this.render();
            } else if (this.currentLine < this.lines.length - 1) {
                // Объединяем со следующей строкой
                this.lines[this.currentLine] += this.lines[this.currentLine + 1];
                this.lines.splice(this.currentLine + 1, 1);
                this.modified = true;
                this.render();
            }
            return;
        }

        // Обычный ввод текста
        if (str && !key.ctrl && !key.meta) {
            const line = this.lines[this.currentLine];
            this.lines[this.currentLine] = 
                line.substring(0, this.cursorX) + 
                str + 
                line.substring(this.cursorX);
            this.cursorX++;
            this.modified = true;
            this.render();
        }
    }

    save() {
        try {
            const content = this.lines.join('\n');
            const fd = this.kernel.syscall('open', this.filename, 'w');
            this.kernel.syscall('write', fd, content);
            this.kernel.syscall('close', fd);
            this.modified = false;
            this.statusMessage = 'File saved!';
            this.statusTimeout = setTimeout(() => {
                this.statusMessage = '';
                this.render();
            }, 2000);
            this.render();
        } catch (error) {
            this.statusMessage = `Error: ${error.message}`;
            this.statusTimeout = setTimeout(() => {
                this.statusMessage = '';
                this.render();
            }, 3000);
            this.render();
        }
    }

    exit() {
        if (process.stdin.isTTY) {
            process.stdin.setRawMode(false);
        }
        process.stdin.removeAllListeners('keypress');
        process.stdout.removeAllListeners('resize');
        console.clear();
        
        // Резолвим Promise чтобы shell продолжил работу
        if (this.exitResolve) {
            this.exitResolve();
        }
    }
}

function run(kernel, args, currentDir) {
    if (!args[0]) {
        console.log('Usage: nano <filename>');
        return;
    }

    // Преобразуем относительный путь в абсолютный
    let filepath = args[0];
    if (!filepath.startsWith('/')) {
        if (currentDir === '/') {
            filepath = '/' + filepath;
        } else {
            filepath = currentDir + '/' + filepath;
        }
    }

    const nano = new Nano(kernel, filepath);
    return nano.start();
}

module.exports = { Nano, run };
