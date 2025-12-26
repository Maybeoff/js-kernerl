#!/usr/bin/env node
/**
 * cat - show file content
 */

function run(kernel, args, currentDir) {
    if (!args[0]) {
        console.log('Usage: cat <filename>');
        return;
    }

    try {
        // Преобразуем относительный путь в абсолютный
        let filepath = args[0];
        if (!filepath.startsWith('/')) {
            if (currentDir === '/') {
                filepath = '/' + filepath;
            } else {
                filepath = currentDir + '/' + filepath;
            }
        }

        const fd = kernel.syscall('open', filepath, 'r');
        let content = '';
        let chunk;
        // Читаем файл полностью
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
