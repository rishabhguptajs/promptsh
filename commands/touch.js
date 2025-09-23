const fs = require('fs');
const path = require('path');

/**
 * Touch Command - Create empty files or update file access and modification times
 * 
 * Usage:
 * - touch <file1> [file2] [file3] ... - Create empty files or update timestamps
 * - touch -h, --help - Show help information
 */
async function touch(args, context) {
    if (args.length === 0) {
        return {
            success: false,
            output: `Usage: touch <file1> [file2] [file3] ...
Creates empty files or updates their timestamps if they already exist.

Examples:
  touch file.txt                    - Create or update file.txt
  touch a.txt b.txt c.txt          - Create multiple files
  touch folder/file.txt             - Create file in subdirectory`,
            error: 'INVALID_ARGS'
        };
    }

    if (args.includes('-h') || args.includes('--help')) {
        return {
            success: true,
            output: `Touch Command Help:

Creates empty files or updates their timestamps if they already exist.

Usage:
  touch <file1> [file2] [file3] ...

Options:
  -h, --help    Show this help message

Examples:
  touch file.txt                    - Create or update file.txt
  touch a.txt b.txt c.txt          - Create multiple files
  touch folder/file.txt             - Create file in subdirectory
  touch *.txt                       - Create files matching pattern (if supported)

Notes:
- If a file already exists, touch updates its access and modification times
- If a file doesn't exist, touch creates an empty file
- Directories in the path will be created if they don't exist`,
            data: { help: true }
        };
    }

    const results = [];
    let successCount = 0;
    let errorCount = 0;

    for (const filePath of args) {
        try {
            const fullPath = path.resolve(context.cwd, filePath);
            const dir = path.dirname(fullPath);

            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            if (fs.existsSync(fullPath)) {
                const now = new Date();
                fs.utimesSync(fullPath, now, now);
                results.push(`Updated timestamp: ${filePath}`);
            } else {
                fs.writeFileSync(fullPath, '');
                results.push(`Created file: ${filePath}`);
            }
            successCount++;
        } catch (error) {
            results.push(`Error with ${filePath}: ${error.message}`);
            errorCount++;
        }
    }

    const output = results.join('\n');
    const success = errorCount === 0;

    return {
        success,
        output,
        error: success ? null : `${errorCount} file(s) failed`,
        data: {
            totalFiles: args.length,
            successfulFiles: successCount,
            failedFiles: errorCount,
            results
        }
    };
}

module.exports = touch;
