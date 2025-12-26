#!/usr/bin/env node
/**
 * echo - print text
 */

function run(kernel, args, currentDir) {
    console.log(args.join(' '));
}

module.exports = { run };
