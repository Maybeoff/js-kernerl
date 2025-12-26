#!/usr/bin/env node
/**
 * touch - create file
 */

function run(kernel, args, currentDir) {
    if (!args[0]) {
        console.log('Usage: touch <filename>');
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

        const fd = kernel.syscall('open', filepath, 'w');
        kernel.syscall('close', fd);
        console.log(`File ${args[0]} created`);
    } catch (error) {
        console.error(`touch: ${error.message}`);
    }
}

module.exports = { run };
