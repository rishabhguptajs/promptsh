const fs = require('fs');
const path = require('path');

/**
 * Tail Command - Display last lines of files
 * 
 * Usage:
 * - tail <file> - Display last 10 lines
 * - tail -n <number> <file> - Display last n lines
 * - tail -c <bytes> <file> - Display last n bytes
 * - tail -f <file> - Follow file changes (not implemented)
 */
async function tail(args, context) {
    if (args.length === 0) {
        return {
            success: false,
            output: `Usage: tail [options] <file>
Options:
  -n <number>    Display last n lines (default: 10)
  -c <bytes>      Display last n bytes
  -q              Quiet mode (no headers)
  -v              Verbose mode (always show headers)

Examples:
  tail file.txt                    - Display last 10 lines
  tail -n 5 file.txt               - Display last 5 lines
  tail -c 100 file.txt            - Display last 100 bytes`,
            error: 'INVALID_ARGS'
        };
    }

    let options = {
        lines: 10,
        bytes: null,
        quiet: false,
        verbose: false
    };

    let files = [];
    let i = 0;

    while (i < args.length && args[i].startsWith('-')) {
        const option = args[i];
        if (option === '-n' && i + 1 < args.length) {
            options.lines = parseInt(args[i + 1]);
            i += 2;
        } else if (option === '-c' && i + 1 < args.length) {
            options.bytes = parseInt(args[i + 1]);
            i += 2;
        } else if (option === '-q') {
            options.quiet = true;
            i++;
        } else if (option === '-v') {
            options.verbose = true;
            i++;
        } else if (option === '--help') {
            return {
                success: true,
                output: `Tail Command Help:

Displays the last lines or bytes of files.

Usage:
  tail [options] <file>

Options:
  -n <number>    Display last n lines (default: 10)
  -c <bytes>      Display last n bytes
  -q              Quiet mode (no headers)
  -v              Verbose mode (always show headers)
  --help          Show this help message

Examples:
  tail file.txt                    - Display last 10 lines
  tail -n 5 file.txt               - Display last 5 lines
  tail -c 100 file.txt            - Display last 100 bytes
  tail -v file1.txt file2.txt    - Display with headers`,
                data: { help: true }
            };
        } else {
            i++;
        }
    }

    while (i < args.length) {
        files.push(args[i]);
        i++;
    }

    if (files.length === 0) {
        return {
            success: false,
            output: 'No files specified',
            error: 'NO_FILES'
        };
    }

    const results = [];
    let successCount = 0;
    let errorCount = 0;

    for (const file of files) {
        try {
            const fullPath = path.resolve(context.cwd, file);
            
            if (!fs.existsSync(fullPath)) {
                results.push(`tail: ${file}: No such file or directory`);
                errorCount++;
                continue;
            }

            const stats = fs.statSync(fullPath);
            if (stats.isDirectory()) {
                results.push(`tail: ${file}: Is a directory`);
                errorCount++;
                continue;
            }

            const content = fs.readFileSync(fullPath, 'utf8');
            let output = '';

            if ((files.length > 1 || options.verbose) && !options.quiet) {
                output += `==> ${file} <==\n`;
            }

            if (options.bytes !== null) {
                const bytes = Buffer.from(content, 'utf8');
                const startByte = Math.max(0, bytes.length - options.bytes);
                const lastBytes = bytes.slice(startByte);
                output += lastBytes.toString('utf8');
            } else {
                const lines = content.split('\n');
                const lastLines = lines.slice(-options.lines);
                output += lastLines.join('\n');
            }

            results.push(output);
            successCount++;

        } catch (error) {
            results.push(`tail: ${file}: ${error.message}`);
            errorCount++;
        }
    }

    const finalOutput = results.join('\n');
    const success = errorCount === 0;

    return {
        success,
        output: finalOutput,
        error: success ? null : `${errorCount} file(s) failed`,
        data: {
            totalFiles: files.length,
            successfulFiles: successCount,
            failedFiles: errorCount,
            options,
            results
        }
    };
}

module.exports = tail;
