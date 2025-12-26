#!/usr/bin/env node
/**
 * ls - list files
 */

const { Kernel } = require('../kernel.js');

const kernel = Kernel.getInstance();
kernel.boot();

const args = process.argv.slice(2);
const dir = args[0] || '/';

try {
    const files = kernel.syscall('ls', dir);
    console.log(`Contents of ${dir}:`);
    files.forEach(file => {
        const type = file.type === 'directory' ? 'd' : '-';
        console.log(`${type}rwxr-xr-x ${file.size.toString().padStart(8)} ${file.name}`);
    });
} catch (error) {
    console.error(`ls: ${error.message}`);
    process.exit(1);
}

kernel.shutdown();
