const fs = require('fs');
const path = require('path');

/**
 * Grep Command - Search for patterns in files
 * 
 * Usage:
 * - grep <pattern> <file> - Search for pattern in file
 * - grep -r <pattern> <directory> - Recursively search in directory
 * - grep -i <pattern> <file> - Case-insensitive search
 * - grep -n <pattern> <file> - Show line numbers
 * - grep -A N <pattern> <file> - Show N lines after each match
 * - grep -B N <pattern> <file> - Show N lines before each match
 */
async function grep(args, context) {
    if (args.length < 2) {
        return {
            success: false,
            output: `Usage: grep [options] <pattern> <file>
Options:
  -r    Search recursively in directories
  -i    Case-insensitive search
  -n    Show line numbers
  -v    Invert match (show non-matching lines)
  -c    Count matching lines
  -l    Show only filenames with matches
  -w    Match whole words only

Examples:
  grep "hello" file.txt              - Search for "hello" in file.txt
  grep -r "function" src/             - Recursively search for "function"
  grep -i "ERROR" log.txt            - Case-insensitive search
  grep -n "TODO" *.js                - Show line numbers`,
            error: 'INVALID_ARGS'
        };
    }

    let options = {
        recursive: false,
        caseInsensitive: false,
        showLineNumbers: false,
        invertMatch: false,
        countOnly: false,
        showFilenamesOnly: false,
        wholeWords: false,
        beforeContext: 0,
        afterContext: 0,
        multipleFiles: false
    };

    let pattern = null;
    let files = [];
    let i = 0;

    while (i < args.length && args[i].startsWith('-')) {
        const option = args[i];
        if (option === '-r') {
            options.recursive = true;
        } else if (option === '-i') {
            options.caseInsensitive = true;
        } else if (option === '-n') {
            options.showLineNumbers = true;
        } else if (option === '-v') {
            options.invertMatch = true;
        } else if (option === '-c') {
            options.countOnly = true;
        } else if (option === '-l') {
            options.showFilenamesOnly = true;
        } else if (option === '-w') {
            options.wholeWords = true;
        } else if (option === '-A') {
            if (i + 1 < args.length && /^\d+$/.test(args[i + 1])) {
                options.afterContext = parseInt(args[i + 1], 10);
                i++;
            } else {
                return {
                    success: false,
                    output: 'Invalid usage for -A. Example: -A 3',
                    error: 'INVALID_ARGS'
                };
            }
        } else if (option === '-B') {
            if (i + 1 < args.length && /^\d+$/.test(args[i + 1])) {
                options.beforeContext = parseInt(args[i + 1], 10);
                i++;
            } else {
                return {
                    success: false,
                    output: 'Invalid usage for -B. Example: -B 2',
                    error: 'INVALID_ARGS'
                };
            }

        } else if (option === '--help') {
            return {
                success: true,
                output: `Grep Command Help:

Searches for patterns in files.

Usage:
  grep [options] <pattern> <file>

Options:
  -r    Search recursively in directories
  -i    Case-insensitive search
  -n    Show line numbers
  -v    Invert match (show non-matching lines)
  -c    Count matching lines
  -l    Show only filenames with matches
  -w    Match whole words only
  -A N  Print N lines of trailing context after each match
  -B N  Print N lines of leading context before each match
  --help Show this help message

Examples:
  grep "hello" file.txt              - Search for "hello" in file.txt
  grep -r "function" src/            - Recursively search for "function"
  grep -i "ERROR" log.txt            - Case-insensitive search
  grep -n "TODO" *.js                - Show line numbers
  grep -A 2 "ERROR" app.log         - Show 2 lines after each match
  grep -B 1 "start" app.log         - Show 1 line before each match
  grep -c "error" *.log             - Count matching lines`,
                data: { help: true }
            };
        }
        i++;
    }

    if (i >= args.length) {
        return {
            success: false,
            output: 'Pattern not specified',
            error: 'NO_PATTERN'
        };
    }
    pattern = args[i];
    i++;

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
    let totalMatches = 0;
    let filesWithMatches = 0;

    options.multipleFiles = files.length > 1;

    for (const file of files) {
        try {
            const fullPath = path.resolve(context.cwd, file);
            const matches = await searchInFile(fullPath, pattern, options, context);
            
            if (matches.length > 0) {
                filesWithMatches++;
                totalMatches += matches.length;
                
                if (options.showFilenamesOnly) {
                    results.push(file);
                } else if (options.countOnly) {
                    results.push(`${file}:${matches.length}`);
                } else {
                    results.push(...matches);
                }
            }
        } catch (error) {
            results.push(`grep: ${file}: ${error.message}`);
        }
    }

    const output = results.join('\n');
    const success = filesWithMatches > 0;

    return {
        success,
        output,
        error: success ? null : 'No matches found',
        data: {
            pattern,
            totalFiles: files.length,
            filesWithMatches,
            totalMatches,
            options,
            results
        }
    };
}

/**
 * Search for pattern in a single file
 * @param {string} filePath - File path
 * @param {string} pattern - Search pattern
 * @param {Object} options - Search options
 * @param {Object} context - Shell context
 * @returns {Array} Array of matching lines
 */
async function searchInFile(filePath, pattern, options, context) {
    if (!fs.existsSync(filePath)) {
        throw new Error('No such file or directory');
    }

    const stats = fs.statSync(filePath);
    if (stats.isDirectory()) {
        if (options.recursive) {
            return await searchInDirectory(filePath, pattern, options, context);
        } else {
            throw new Error('Is a directory');
        }
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const matches = [];

    let regexPattern = pattern;
    if (options.caseInsensitive) {
        regexPattern = new RegExp(pattern, 'i');
    } else {
        regexPattern = new RegExp(pattern);
    }

    if (options.wholeWords) {
        regexPattern = new RegExp(`\\b${pattern}\\b`, options.caseInsensitive ? 'i' : '');
    }

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNumber = i + 1;

        let isMatch = regexPattern.test(line);

        if (options.invertMatch) {
            isMatch = !isMatch;
        }

        if (isMatch) {
            const start = Math.max(0, i - options.beforeContext);
            const end = Math.min(lines.length - 1, i + options.afterContext);

            for (let j = start; j <= end; j++) {
                const ctxLineNumber = j + 1;
                let outLine = lines[j];

                if (options.showLineNumbers) {
                    outLine = `${filePath}:${ctxLineNumber}:${outLine}`;
                } else if (options.multipleFiles) {
                    outLine = `${filePath}:${outLine}`;
                }

                matches.push(outLine);
            }
        }
    }

    return matches;
}

/**
 * Recursively search in directory
 * @param {string} dirPath - Directory path
 * @param {string} pattern - Search pattern
 * @param {Object} options - Search options
 * @param {Object} context - Shell context
 * @returns {Array} Array of matching lines
 */
async function searchInDirectory(dirPath, pattern, options, context) {
    const results = [];
    
    try {
        const items = fs.readdirSync(dirPath);
        
        for (const item of items) {
            const itemPath = path.join(dirPath, item);
            const stats = fs.statSync(itemPath);
            
            if (stats.isDirectory()) {
                const subResults = await searchInDirectory(itemPath, pattern, options, context);
                results.push(...subResults);
            } else {
                const fileResults = await searchInFile(itemPath, pattern, options, context);
                results.push(...fileResults);
            }
        }
    } catch (error) {
        console.error(`Error searching in directory ${dirPath}: ${error.message}`);
    }
    
    return results;
}

module.exports = grep;
