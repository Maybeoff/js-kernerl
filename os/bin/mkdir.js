#!/usr/bin/env node
/**
 * mkdir - create directory
 */

const { Kernel } = require('../kernel.js');

const kernel = Kernel.getInstance();
kernel.boot();

const args = process.argv.slice(2);

if (args.length === 0) {
    console.error('Usage: mkdir <dirname>');
    process.exit(1);
}

try {
    kernel.fileSystem.mkdir(args[0]);
    console.log(`Directory ${args[0]} created`);
} catch (error) {
    console.error(`mkdir: ${error.message}`);
    process.exit(1);
}

kernel.shutdown();
