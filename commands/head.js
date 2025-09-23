const fs = require('fs');
const path = require('path');

/**
 * Head Command - Display first lines or bytes of files
 * 
 * Usage:
 * - head <file> - Display first 10 lines
 * - head -n <number> <file> - Display first n lines
 * - head -c <bytes> <file> - Display first n bytes
 */
async function head(args, context) {
    if (args.length === 0) {
        return {
            success: false,
            output: `Usage: head [options] <file>
Options:
  -n <number>    Display first n lines (default: 10)
  -c <bytes>      Display first n bytes
  -q              Quiet mode (no headers)
  -v              Verbose mode (always show headers)

Examples:
  head file.txt                    - Display first 10 lines
  head -n 5 file.txt               - Display first 5 lines
  head -c 100 file.txt            - Display first 100 bytes`,
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
                output: `Head Command Help:

Displays the first lines or bytes of files.

Usage:
  head [options] <file>

Options:
  -n <number>    Display first n lines (default: 10)
  -c <bytes>      Display first n bytes
  -q              Quiet mode (no headers)
  -v              Verbose mode (always show headers)
  --help          Show this help message

Examples:
  head file.txt                    - Display first 10 lines
  head -n 5 file.txt               - Display first 5 lines
  head -c 100 file.txt            - Display first 100 bytes
  head -v file1.txt file2.txt    - Display with headers`,
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
                results.push(`head: ${file}: No such file or directory`);
                errorCount++;
                continue;
            }

            const stats = fs.statSync(fullPath);
            if (stats.isDirectory()) {
                results.push(`head: ${file}: Is a directory`);
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
                const firstBytes = bytes.slice(0, options.bytes);
                output += firstBytes.toString('utf8');
            } else {
                const lines = content.split('\n');
                const firstLines = lines.slice(0, options.lines);
                output += firstLines.join('\n');
            }

            results.push(output);
            successCount++;

        } catch (error) {
            results.push(`head: ${file}: ${error.message}`);
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

module.exports = head;
