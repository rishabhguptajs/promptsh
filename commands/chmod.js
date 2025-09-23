const fs = require('fs');
const path = require('path');

/**
 * Chmod Command - Change file permissions
 * 
 * Usage:
 * - chmod <mode> <file> - Change file permissions
 * - chmod -R <mode> <file> - Recursively change permissions
 * - chmod +x <file> - Add execute permission
 * - chmod -x <file> - Remove execute permission
 */
async function chmod(args, context) {
    if (args.length < 2) {
        return {
            success: false,
            output: `Usage: chmod [options] <mode> <file>
Options:
  -R    Change permissions recursively for directories
  -v    Verbose output

Modes:
  Numeric: 755, 644, 600, etc.
  Symbolic: +x, -x, +rw, -w, etc.
  Octal: 0o755, 0o644, etc.

Examples:
  chmod 755 script.sh              - Set permissions to rwxr-xr-x
  chmod +x script.sh               - Add execute permission
  chmod -R 644 directory/          - Recursively set to rw-r--r--
  chmod u+x,g-w,o+r file.txt      - Complex symbolic permissions`,
            error: 'INVALID_ARGS'
        };
    }

    let recursive = false;
    let verbose = false;
    let mode = null;
    let files = [];
    let i = 0;

    while (i < args.length && args[i].startsWith('-')) {
        const option = args[i];
        if (option === '-R' || option === '-r') {
            recursive = true;
        } else if (option === '-v') {
            verbose = true;
        } else if (option === '--help') {
            return {
                success: true,
                output: `Chmod Command Help:

Changes file and directory permissions.

Usage:
  chmod [options] <mode> <file>

Options:
  -R, -r    Change permissions recursively for directories
  -v        Verbose output
  --help    Show this help message

Modes:
  Numeric: 755, 644, 600, etc.
  Symbolic: +x, -x, +rw, -w, etc.
  Octal: 0o755, 0o644, etc.

Examples:
  chmod 755 script.sh              - Set permissions to rwxr-xr-x
  chmod +x script.sh               - Add execute permission
  chmod -R 644 directory/          - Recursively set to rw-r--r--
  chmod u+x,g-w,o+r file.txt      - Complex symbolic permissions

Permission Values:
  7 = rwx (read, write, execute)
  6 = rw- (read, write)
  5 = r-x (read, execute)
  4 = r-- (read only)
  3 = -wx (write, execute)
  2 = -w- (write only)
  1 = --x (execute only)
  0 = --- (no permissions)`,
                data: { help: true }
            };
        }
        i++;
    }

    if (i >= args.length) {
        return {
            success: false,
            output: 'Mode not specified',
            error: 'NO_MODE'
        };
    }
    mode = args[i];
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
    let successCount = 0;
    let errorCount = 0;

    for (const file of files) {
        try {
            const fullPath = path.resolve(context.cwd, file);
            
            if (!fs.existsSync(fullPath)) {
                results.push(`File not found: ${file}`);
                errorCount++;
                continue;
            }

            const stats = fs.statSync(fullPath);
            const isDirectory = stats.isDirectory();

            if (isDirectory && recursive) {
                const changedFiles = await changePermissionsRecursive(fullPath, mode, verbose);
                results.push(`Directory ${file}: ${changedFiles} files changed`);
                successCount++;
            } else if (isDirectory && !recursive) {
                results.push(`Skipping directory ${file} (use -R for recursive)`);
                errorCount++;
            } else {
                const newMode = parseMode(mode, stats.mode);
                fs.chmodSync(fullPath, newMode);
                
                if (verbose) {
                    const oldPerms = (stats.mode & parseInt('777', 8)).toString(8);
                    const newPerms = newMode.toString(8);
                    results.push(`${file}: ${oldPerms} -> ${newPerms}`);
                } else {
                    results.push(`Changed permissions for ${file}`);
                }
                successCount++;
            }
        } catch (error) {
            results.push(`Error with ${file}: ${error.message}`);
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
            recursive,
            verbose,
            results
        }
    };
}

/**
 * Parse permission mode string
 * @param {string} mode - Mode string (numeric, symbolic, or octal)
 * @param {number} currentMode - Current file mode
 * @returns {number} Parsed mode
 */
function parseMode(mode, currentMode) {
    if (mode.startsWith('0o') || mode.startsWith('0O')) {
        return parseInt(mode.slice(2), 8);
    }

    if (/^[0-7]{3,4}$/.test(mode)) {
        return parseInt(mode, 8);
    }

    if (mode.startsWith('+') || mode.startsWith('-')) {
        const currentPerms = currentMode & parseInt('777', 8);
        let newPerms = currentPerms;

        if (mode.includes('x')) {
            if (mode.startsWith('+')) {
                newPerms |= parseInt('111', 8);
            } else {
                newPerms &= ~parseInt('111', 8); 
            }
        }

        if (mode.includes('w')) {
            if (mode.startsWith('+')) {
                newPerms |= parseInt('222', 8); 
            } else {
                newPerms &= ~parseInt('222', 8); 
            }
        }

        if (mode.includes('r')) {
            if (mode.startsWith('+')) {
                newPerms |= parseInt('444', 8); 
            } else {
                newPerms &= ~parseInt('444', 8); 
            }
        }

        return newPerms;
    }

    
    return parseInt('644', 8);
}

/**
 * Recursively change permissions
 * @param {string} dirPath - Directory path
 * @param {string} mode - Permission mode
 * @param {boolean} verbose - Verbose output
 * @returns {number} Number of files changed
 */
async function changePermissionsRecursive(dirPath, mode, verbose) {
    let changedCount = 0;
    
    try {
        const items = fs.readdirSync(dirPath);
        
        for (const item of items) {
            const itemPath = path.join(dirPath, item);
            const stats = fs.statSync(itemPath);
            
            const newMode = parseMode(mode, stats.mode);
            fs.chmodSync(itemPath, newMode);
            changedCount++;
            
            if (stats.isDirectory()) {
                changedCount += await changePermissionsRecursive(itemPath, mode, verbose);
            }
        }
    } catch (error) {
        
    }
    
    return changedCount;
}

module.exports = chmod;
