#!/usr/bin/env node
/**
 * Shell - интерпретатор команд для JS Kernel
 */

const readline = require('readline');

class Shell {
    constructor(kernel) {
        this.kernel = kernel;
        this.currentDir = '/';
        this.customCommands = new Map(); // Хранилище пользовательских команд
        this.builtins = {
            'help': this.help.bind(this),
            'ls': this.ls.bind(this),
            'mkdir': this.mkdir.bind(this),
            'ps': this.ps.bind(this),
            'meminfo': this.meminfo.bind(this),
            'cd': this.cd.bind(this),
            'pwd': this.pwd.bind(this),
            'define': this.define.bind(this),
            'exit': this.exit.bind(this)
        };
    }

    start() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: `jskernel:${this.currentDir} $ `
        });

        this.rl.prompt();

        this.rl.on('line', async (input) => {
            const cmd = input.trim();
            
            if (!cmd) {
                this.rl.prompt();
                return;
            }

            const parts = cmd.split(' ');
            const command = parts[0];
            const args = parts.slice(1);

            try {
                if (this.builtins[command]) {
                    const result = this.builtins[command](args);
                    if (result instanceof Promise) {
                        await result;
                    }
                } else if (this.customCommands.has(command)) {
                    // Выполняем пользовательскую команду
                    await this.executeCustomCommand(command, args);
                } else {
                    // Ищем команду в ./os/etc/
                    await this.executeExternalCommand(command, args);
                }
            } catch (error) {
                console.error(`Error: ${error.message}`);
            }

            this.rl.setPrompt(`jskernel:${this.currentDir} $ `);
            this.rl.prompt();
        });

        this.rl.on('close', () => {
            console.log('\nShutting down...');
            this.kernel.shutdown();
            process.exit(0);
        });
    }

    help(args) {
        console.log('Available commands:');
        console.log('  help          - show this help');
        console.log('  ls [path]     - list files');
        console.log('  cat <file>    - show file content');
        console.log('  echo <text>   - print text');
        console.log('  touch <file>  - create file');
        console.log('  mkdir <dir>   - create directory');
        console.log('  cd <dir>      - change directory');
        console.log('  pwd           - print working directory');
        console.log('  ps            - list processes');
        console.log('  meminfo       - memory information');
        console.log('  nano <file>   - edit file');
        console.log('  define <cmd> <path> - define custom command');
        console.log('  exit          - shutdown kernel');
        
        if (this.customCommands.size > 0) {
            console.log('\nCustom commands:');
            for (const [cmd, path] of this.customCommands) {
                console.log(`  ${cmd.padEnd(14)} -> ${path}`);
            }
        }
    }

    define(args) {
        if (args.length < 2) {
            console.log('Usage: define <command> <path>');
            console.log('Example: define myapp /home/user/myapp.js');
            return;
        }

        const commandName = args[0];
        const commandPath = args[1];

        // Проверяем что не переопределяем встроенную команду
        if (this.builtins[commandName]) {
            console.log(`Error: Cannot redefine builtin command: ${commandName}`);
            return;
        }

        this.customCommands.set(commandName, commandPath);
        console.log(`Command '${commandName}' defined as '${commandPath}'`);
    }

    async executeCustomCommand(command, args) {
        const commandPath = this.customCommands.get(command);
        const path = require('path');
        const fs = require('fs');
        
        // Преобразуем путь (может быть относительным или абсолютным в виртуальной ФС)
        let resolvedPath;
        
        if (commandPath.startsWith('/')) {
            // Абсолютный путь в виртуальной ФС - ищем в реальной ФС через sync
            // Пытаемся найти файл через getSyncPath
            const realPath = this.kernel.fileSystem.getSyncPath(commandPath);
            if (realPath && fs.existsSync(realPath)) {
                resolvedPath = realPath;
            } else {
                console.log(`Command file not found: ${commandPath}`);
                return;
            }
        } else {
            // Относительный путь - относительно текущей директории хоста
            resolvedPath = path.resolve(process.cwd(), commandPath);
            if (!fs.existsSync(resolvedPath)) {
                console.log(`Command file not found: ${commandPath}`);
                return;
            }
        }

        this.rl.pause();
        
        try {
            delete require.cache[resolvedPath];
            
            const cmd = require(resolvedPath);
            if (cmd.run) {
                const result = cmd.run(this.kernel, args, this.currentDir);
                if (result instanceof Promise) {
                    await result;
                }
            } else {
                console.log(`Error: ${resolvedPath} does not export a 'run' function`);
            }
        } catch (error) {
            console.error(`Error executing ${command}: ${error.message}`);
        }
        
        this.rl.resume();
    }

    async executeExternalCommand(command, args) {
        const path = require('path');
        const fs = require('fs');
        
        // Ищем команду в ./os/etc/
        const commandPath = path.join(__dirname, '..', 'etc', `${command}.js`);
        
        if (!fs.existsSync(commandPath)) {
            console.log(`Command not found: ${command}`);
            return;
        }

        this.rl.pause();
        
        try {
            delete require.cache[commandPath];
            
            const cmd = require(commandPath);
            if (cmd.run) {
                const result = cmd.run(this.kernel, args, this.currentDir);
                if (result instanceof Promise) {
                    await result;
                }
            }
        } catch (error) {
            console.error(`Error executing ${command}: ${error.message}`);
        }
        
        this.rl.resume();
    }

    ls(args) {
        const dir = args[0] || this.currentDir;
        try {
            const files = this.kernel.syscall('ls', dir);
            console.log(`Contents of ${dir}:`);
            files.forEach(file => {
                const type = file.type === 'directory' ? 'd' : '-';
                console.log(`${type}rwxr-xr-x ${file.size.toString().padStart(8)} ${file.name}`);
            });
        } catch (error) {
            console.error(`ls: ${error.message}`);
        }
    }

    mkdir(args) {
        if (!args[0]) {
            console.log('Usage: mkdir <dirname>');
            return;
        }

        try {
            let dirpath = args[0];
            if (!dirpath.startsWith('/')) {
                if (this.currentDir === '/') {
                    dirpath = '/' + dirpath;
                } else {
                    dirpath = this.currentDir + '/' + dirpath;
                }
            }

            this.kernel.fileSystem.mkdir(dirpath);
            console.log(`Directory ${args[0]} created`);
        } catch (error) {
            console.error(`mkdir: ${error.message}`);
        }
    }

    cd(args) {
        if (!args[0]) {
            this.currentDir = '/';
            return;
        }

        let newDir = args[0];

        if (newDir === '..') {
            if (this.currentDir === '/') {
                return;
            }
            const parts = this.currentDir.split('/').filter(p => p);
            parts.pop();
            this.currentDir = '/' + parts.join('/');
            if (this.currentDir === '/') this.currentDir = '/';
        } else if (newDir === '.') {
            return;
        } else if (newDir.startsWith('./')) {
            newDir = newDir.substring(2);
            if (this.currentDir === '/') {
                this.currentDir = '/' + newDir;
            } else {
                this.currentDir = this.currentDir + '/' + newDir;
            }
        } else if (newDir.startsWith('/')) {
            this.currentDir = newDir;
        } else {
            if (this.currentDir === '/') {
                this.currentDir = '/' + newDir;
            } else {
                this.currentDir = this.currentDir + '/' + newDir;
            }
        }

        this.currentDir = this.currentDir.replace(/\/+/g, '/');
        if (this.currentDir !== '/' && this.currentDir.endsWith('/')) {
            this.currentDir = this.currentDir.slice(0, -1);
        }
    }

    pwd(args) {
        console.log(this.currentDir);
    }

    ps(args) {
        const processes = this.kernel.syscall('ps');
        console.log('PID  NAME           STATE      PRIORITY');
        console.log('---  ----           -----      --------');
        processes.forEach(proc => {
            console.log(`${proc.pid.toString().padEnd(4)} ${proc.name.padEnd(14)} ${proc.state.padEnd(10)} ${proc.priority}`);
        });
    }

    meminfo(args) {
        const memInfo = this.kernel.syscall('meminfo');
        console.log('Memory Information:');
        console.log(`Total:     ${memInfo.total} bytes`);
        console.log(`Used:      ${memInfo.used} bytes`);
        console.log(`Free:      ${memInfo.free} bytes`);
        console.log(`Pages:     ${memInfo.pages.used}/${memInfo.pages.total} used`);
    }

    exit(args) {
        process.exit(0);
    }
}

function run(kernel, args) {
    const shell = new Shell(kernel);
    shell.start();
}

module.exports = { Shell, run };
