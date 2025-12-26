#!/usr/bin/env node
/**
 * meminfo - show memory information
 */

const { Kernel } = require('../kernel.js');

const kernel = Kernel.getInstance();
kernel.boot();

try {
    const memInfo = kernel.syscall('meminfo');
    console.log('Memory Information:');
    console.log(`Total:     ${memInfo.total} bytes`);
    console.log(`Used:      ${memInfo.used} bytes`);
    console.log(`Free:      ${memInfo.free} bytes`);
    console.log(`Pages:     ${memInfo.pages.used}/${memInfo.pages.total} used`);
} catch (error) {
    console.error(`meminfo: ${error.message}`);
    process.exit(1);
}

kernel.shutdown();
