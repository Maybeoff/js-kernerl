#!/usr/bin/env node
/**
 * ps - list processes
 */

const { Kernel } = require('../kernel.js');

const kernel = Kernel.getInstance();
kernel.boot();

try {
    const processes = kernel.syscall('ps');
    console.log('PID  NAME           STATE      PRIORITY');
    console.log('---  ----           -----      --------');
    processes.forEach(proc => {
        console.log(`${proc.pid.toString().padEnd(4)} ${proc.name.padEnd(14)} ${proc.state.padEnd(10)} ${proc.priority}`);
    });
} catch (error) {
    console.error(`ps: ${error.message}`);
    process.exit(1);
}

kernel.shutdown();
