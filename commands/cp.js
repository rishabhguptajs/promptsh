const fs = require('fs');
const path = require('path');

/**
 * Cp Command - Copy files and directories
 * 
 * Usage:
 * - cp <source> <destination> - Copy file to destination
 * - cp -r <source> <destination> - Copy directory recursively
 * - cp <file1> <file2> <file3> <directory> - Copy multiple files to directory
 */
async function cp(args, context) {
    if (args.length < 2) {
        return {
            success: false,
            output: `Usage: cp [options] <source> <destination>
       cp [options] <file1> <file2> ... <directory>

Options:
  -r, -R    Copy directories recursively
  -v        Verbose output
  -f        Force overwrite without prompting
  -p        Preserve file attributes

Examples:
  cp file.txt backup.txt              - Copy file to new name
  cp file.txt directory/              - Copy file to directory
  cp -r source/ destination/          - Copy directory recursively
  cp file1.txt file2.txt backup/      - Copy multiple files to directory`,
            error: 'INVALID_ARGS'
        };
    }

    let options = {
        recursive: false,
        verbose: false,
        force: false,
        preserve: false
    };

    let sources = [];
    let destination = null;
    let i = 0;

    while (i < args.length && args[i].startsWith('-')) {
        const option = args[i];
        if (option === '-r' || option === '-R') {
            options.recursive = true;
        } else if (option === '-v') {
            options.verbose = true;
        } else if (option === '-f') {
            options.force = true;
        } else if (option === '-p') {
            options.preserve = true;
        } else if (option === '--help') {
            return {
                success: true,
                output: `Cp Command Help:

Copies files and directories.

Usage:
  cp [options] <source> <destination>
  cp [options] <file1> <file2> ... <directory>

Options:
  -r, -R    Copy directories recursively
  -v        Verbose output
  -f        Force overwrite without prompting
  -p        Preserve file attributes
  --help    Show this help message

Examples:
  cp file.txt backup.txt              - Copy file to new name
  cp file.txt directory/              - Copy file to directory
  cp -r source/ destination/          - Copy directory recursively
  cp file1.txt file2.txt backup/      - Copy multiple files to directory
  cp -v file.txt backup.txt          - Verbose copy`,
                data: { help: true }
            };
        }
        i++;
    }

    while (i < args.length) {
        if (i === args.length - 1) {
            destination = args[i];
        } else {
            sources.push(args[i]);
        }
        i++;
    }

    if (sources.length === 0) {
        return {
            success: false,
            output: 'No source files specified',
            error: 'NO_SOURCES'
        };
    }

    if (!destination) {
        return {
            success: false,
            output: 'No destination specified',
            error: 'NO_DESTINATION'
        };
    }

    const results = [];
    let successCount = 0;
    let errorCount = 0;

    for (const source of sources) {
        try {
            const sourcePath = path.resolve(context.cwd, source);
            const destPath = path.resolve(context.cwd, destination);

            if (!fs.existsSync(sourcePath)) {
                results.push(`cp: ${source}: No such file or directory`);
                errorCount++;
                continue;
            }

            const sourceStats = fs.statSync(sourcePath);
            
            if (sourceStats.isDirectory()) {
                if (!options.recursive) {
                    results.push(`cp: ${source}: Is a directory (use -r for recursive copy)`);
                    errorCount++;
                    continue;
                }
                
                const result = await copyDirectory(sourcePath, destPath, options);
                results.push(result.message);
                if (result.success) {
                    successCount++;
                } else {
                    errorCount++;
                }
            } else {
                const result = await copyFile(sourcePath, destPath, options);
                results.push(result.message);
                if (result.success) {
                    successCount++;
                } else {
                    errorCount++;
                }
            }
        } catch (error) {
            results.push(`cp: ${source}: ${error.message}`);
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
            totalSources: sources.length,
            successfulCopies: successCount,
            failedCopies: errorCount,
            destination,
            options,
            results
        }
    };
}

/**
 * Copy a single file
 * @param {string} sourcePath - Source file path
 * @param {string} destPath - Destination path
 * @param {Object} options - Copy options
 * @returns {Object} Result object
 */
async function copyFile(sourcePath, destPath, options) {
    try {
        const destStats = fs.statSync(destPath);
        
        if (destStats.isDirectory()) {
            const fileName = path.basename(sourcePath);
            const finalDestPath = path.join(destPath, fileName);
            
            if (fs.existsSync(finalDestPath) && !options.force) {
                return {
                    success: false,
                    message: `cp: ${finalDestPath}: File exists (use -f to force overwrite)`
                };
            }
            
            fs.copyFileSync(sourcePath, finalDestPath);
            
            if (options.preserve) {
                const sourceStats = fs.statSync(sourcePath);
                fs.utimesSync(finalDestPath, sourceStats.atime, sourceStats.mtime);
                fs.chmodSync(finalDestPath, sourceStats.mode);
            }
            
            return {
                success: true,
                message: options.verbose ? `Copied ${sourcePath} to ${finalDestPath}` : `Copied ${path.basename(sourcePath)}`
            };
        } else {
            if (fs.existsSync(destPath) && !options.force) {
                return {
                    success: false,
                    message: `cp: ${destPath}: File exists (use -f to force overwrite)`
                };
            }
            
            fs.copyFileSync(sourcePath, destPath);
            
            if (options.preserve) {
                const sourceStats = fs.statSync(sourcePath);
                fs.utimesSync(destPath, sourceStats.atime, sourceStats.mtime);
                fs.chmodSync(destPath, sourceStats.mode);
            }
            
            return {
                success: true,
                message: options.verbose ? `Copied ${sourcePath} to ${destPath}` : `Copied ${path.basename(sourcePath)}`
            };
        }
    } catch (error) {
        return {
            success: false,
            message: `cp: ${error.message}`
        };
    }
}

/**
 * Copy a directory recursively
 * @param {string} sourcePath - Source directory path
 * @param {string} destPath - Destination path
 * @param {Object} options - Copy options
 * @returns {Object} Result object
 */
async function copyDirectory(sourcePath, destPath, options) {
    try {
        const sourceStats = fs.statSync(sourcePath);
        const sourceName = path.basename(sourcePath);
        
        let finalDestPath;
        if (fs.existsSync(destPath)) {
            const destStats = fs.statSync(destPath);
            if (destStats.isDirectory()) {
                finalDestPath = path.join(destPath, sourceName);
            } else {
                return {
                    success: false,
                    message: `cp: ${destPath}: Not a directory`
                };
            }
        } else {
            finalDestPath = destPath;
        }
        
        fs.mkdirSync(finalDestPath, { recursive: true });
        
        const items = fs.readdirSync(sourcePath);
        let copiedItems = 0;
        
        for (const item of items) {
            const itemSourcePath = path.join(sourcePath, item);
            const itemDestPath = path.join(finalDestPath, item);
            
            const itemStats = fs.statSync(itemSourcePath);
            
            if (itemStats.isDirectory()) {
                const result = await copyDirectory(itemSourcePath, itemDestPath, options);
                if (result.success) {
                    copiedItems++;
                }
            } else {
                const result = await copyFile(itemSourcePath, itemDestPath, options);
                if (result.success) {
                    copiedItems++;
                }
            }
        }
        
        if (options.preserve) {
            fs.utimesSync(finalDestPath, sourceStats.atime, sourceStats.mtime);
            fs.chmodSync(finalDestPath, sourceStats.mode);
        }
        
        return {
            success: true,
            message: options.verbose ? `Copied directory ${sourcePath} to ${finalDestPath} (${copiedItems} items)` : `Copied directory ${sourceName}`
        };
    } catch (error) {
        return {
            success: false,
            message: `cp: ${error.message}`
        };
    }
}

module.exports = cp;
