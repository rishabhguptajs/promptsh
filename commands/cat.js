const fs = require('fs');
const path = require('path');

/**
 * Cat Command - Display file contents
 * 
 * Usage:
 * - cat <file> - Display file contents
 * - cat <file1> <file2> - Display multiple files
 * - cat -n <file> - Display with line numbers
 * - cat -b <file> - Display with line numbers (non-empty lines only)
 */
async function cat(args, context) {
    if (args.length === 0) {
        return {
            success: false,
            output: `Usage: cat [options] <file1> [file2] ...
Options:
  -n    Number all output lines
  -b    Number non-empty output lines
  -s    Squeeze multiple adjacent empty lines into one
  -E    Display $ at end of each line
  -T    Display TAB characters as ^I

Examples:
  cat file.txt                       - Display file contents
  cat file1.txt file2.txt           - Display multiple files
  cat -n file.txt                   - Display with line numbers
  cat -b file.txt                   - Display with line numbers (non-empty only)`,
            error: 'INVALID_ARGS'
        };
    }

    let options = {
        numberLines: false,
        numberNonEmpty: false,
        squeezeEmpty: false,
        showEnds: false,
        showTabs: false
    };

    let files = [];
    let i = 0;

    while (i < args.length && args[i].startsWith('-')) {
        const option = args[i];
        if (option === '-n') {
            options.numberLines = true;
        } else if (option === '-b') {
            options.numberNonEmpty = true;
        } else if (option === '-s') {
            options.squeezeEmpty = true;
        } else if (option === '-E') {
            options.showEnds = true;
        } else if (option === '-T') {
            options.showTabs = true;
        } else if (option === '--help') {
            return {
                success: true,
                output: `Cat Command Help:

Displays file contents.

Usage:
  cat [options] <file1> [file2] ...

Options:
  -n    Number all output lines
  -b    Number non-empty output lines
  -s    Squeeze multiple adjacent empty lines into one
  -E    Display $ at end of each line
  -T    Display TAB characters as ^I
  --help Show this help message

Examples:
  cat file.txt                       - Display file contents
  cat file1.txt file2.txt           - Display multiple files
  cat -n file.txt                   - Display with line numbers
  cat -b file.txt                   - Display with line numbers (non-empty only)
  cat -E file.txt                   - Show line endings`,
                data: { help: true }
            };
        }
        i++;
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
    let lineNumber = 1;

    for (const file of files) {
        try {
            const fullPath = path.resolve(context.cwd, file);
            
            if (!fs.existsSync(fullPath)) {
                results.push(`cat: ${file}: No such file or directory`);
                errorCount++;
                continue;
            }

            const stats = fs.statSync(fullPath);
            if (stats.isDirectory()) {
                results.push(`cat: ${file}: Is a directory`);
                errorCount++;
                continue;
            }

            const content = fs.readFileSync(fullPath, 'utf8');
            const lines = content.split('\n');
            
            let fileOutput = [];
            let nonEmptyLineNumber = 1;

            for (let j = 0; j < lines.length; j++) {
                let line = lines[j];
                const isEmpty = line.trim() === '';

                if (options.squeezeEmpty && isEmpty && j > 0 && lines[j - 1].trim() === '') {
                    continue;
                }

                let prefix = '';
                if (options.numberLines) {
                    prefix = `${lineNumber.toString().padStart(6)}  `;
                    lineNumber++;
                } else if (options.numberNonEmpty && !isEmpty) {
                    prefix = `${nonEmptyLineNumber.toString().padStart(6)}  `;
                    nonEmptyLineNumber++;
                }

                if (options.showTabs) {
                    line = line.replace(/\t/g, '^I');
                }
                if (options.showEnds) {
                    line += '$';
                }

                fileOutput.push(prefix + line);
            }

            results.push(fileOutput.join('\n'));
            successCount++;

        } catch (error) {
            results.push(`cat: ${file}: ${error.message}`);
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
            totalFiles: files.length,
            successfulFiles: successCount,
            failedFiles: errorCount,
            options,
            results
        }
    };
}

module.exports = cat;
