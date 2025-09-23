const fs = require('fs');
const path = require('path');

/**
 * Find Command - Search for files and directories
 * 
 * Usage:
 * - find <directory> -name <pattern> - Find files by name
 * - find <directory> -type <type> - Find by type (f=file, d=directory)
 * - find <directory> -size <size> - Find by size
 * - find <directory> -mtime <days> - Find by modification time
 */
async function find(args, context) {
    if (args.length < 3) {
        return {
            success: false,
            output: `Usage: find <directory> [options] <pattern>
Options:
  -name <pattern>    Find files matching name pattern
  -type <type>       Find by type (f=file, d=directory, l=symlink)
  -size <size>       Find by size (+n=larger, -n=smaller, n=exact)
  -mtime <days>      Find by modification time (+n=older, -n=newer)
  -maxdepth <n>      Limit search depth
  -mindepth <n>      Start search at depth n

Examples:
  find . -name "*.js"                - Find all .js files
  find . -type f -name "*.txt"       - Find files named *.txt
  find . -size +1M                   - Find files larger than 1MB
  find . -mtime -7                   - Find files modified in last 7 days`,
            error: 'INVALID_ARGS'
        };
    }

    let searchDir = args[0];
    let criteria = [];
    let options = {
        maxDepth: Infinity,
        minDepth: 0
    };

    for (let i = 1; i < args.length; i++) {
        const arg = args[i];
        
        if (arg === '-name' && i + 1 < args.length) {
            criteria.push({ type: 'name', pattern: args[i + 1] });
            i++;
        } else if (arg === '-type' && i + 1 < args.length) {
            criteria.push({ type: 'type', value: args[i + 1] });
            i++;
        } else if (arg === '-size' && i + 1 < args.length) {
            criteria.push({ type: 'size', value: args[i + 1] });
            i++;
        } else if (arg === '-mtime' && i + 1 < args.length) {
            criteria.push({ type: 'mtime', value: args[i + 1] });
            i++;
        } else if (arg === '-maxdepth' && i + 1 < args.length) {
            options.maxDepth = parseInt(args[i + 1]);
            i++;
        } else if (arg === '-mindepth' && i + 1 < args.length) {
            options.minDepth = parseInt(args[i + 1]);
            i++;
        } else if (arg === '--help') {
            return {
                success: true,
                output: `Find Command Help:

Searches for files and directories.

Usage:
  find <directory> [options] <pattern>

Options:
  -name <pattern>    Find files matching name pattern
  -type <type>       Find by type (f=file, d=directory, l=symlink)
  -size <size>       Find by size (+n=larger, -n=smaller, n=exact)
  -mtime <days>      Find by modification time (+n=older, -n=newer)
  -maxdepth <n>      Limit search depth
  -mindepth <n>      Start search at depth n
  --help             Show this help message

Examples:
  find . -name "*.js"                - Find all .js files
  find . -type f -name "*.txt"       - Find files named *.txt
  find . -size +1M                   - Find files larger than 1MB
  find . -mtime -7                   - Find files modified in last 7 days
  find . -maxdepth 2 -name "*.js"    - Find .js files within 2 levels`,
                data: { help: true }
            };
        }
    }

    if (criteria.length === 0) {
        return {
            success: false,
            output: 'No search criteria specified',
            error: 'NO_CRITERIA'
        };
    }

    try {
        const fullPath = path.resolve(context.cwd, searchDir);
        
        if (!fs.existsSync(fullPath)) {
            return {
                success: false,
                output: `find: '${searchDir}': No such file or directory`,
                error: 'DIRECTORY_NOT_FOUND'
            };
        }

        const results = await searchDirectory(fullPath, criteria, options, 0);
        
        return {
            success: true,
            output: results.join('\n'),
            data: {
                searchDir,
                criteria,
                options,
                resultCount: results.length,
                results
            }
        };
    } catch (error) {
        return {
            success: false,
            output: `find: ${error.message}`,
            error: error.message
        };
    }
}

/**
 * Search directory recursively
 * @param {string} dirPath - Directory path
 * @param {Array} criteria - Search criteria
 * @param {Object} options - Search options
 * @param {number} depth - Current depth
 * @returns {Array} Array of matching paths
 */
async function searchDirectory(dirPath, criteria, options, depth) {
    const results = [];
    
    if (depth < options.minDepth) {
    } else if (depth > options.maxDepth) {
        return results;
    }

    try {
        const items = fs.readdirSync(dirPath);
        
        for (const item of items) {
            const itemPath = path.join(dirPath, item);
            const stats = fs.statSync(itemPath);
            
            if (depth >= options.minDepth && depth <= options.maxDepth) {
                if (matchesCriteria(itemPath, stats, criteria)) {
                    results.push(itemPath);
                }
            }
            
            if (stats.isDirectory()) {
                const subResults = await searchDirectory(itemPath, criteria, options, depth + 1);
                results.push(...subResults);
            }
        }
    } catch (error) {
        console.error(`Error searching in directory ${dirPath}: ${error.message}`);
    }
    
    return results;
}

/**
 * Check if file matches search criteria
 * @param {string} filePath - File path
 * @param {Object} stats - File stats
 * @param {Array} criteria - Search criteria
 * @returns {boolean} True if matches
 */
function matchesCriteria(filePath, stats, criteria) {
    for (const criterion of criteria) {
        switch (criterion.type) {
            case 'name':
                if (!matchesNamePattern(filePath, criterion.pattern)) {
                    return false;
                }
                break;
                
            case 'type':
                if (!matchesType(stats, criterion.value)) {
                    return false;
                }
                break;
                
            case 'size':
                if (!matchesSize(stats, criterion.value)) {
                    return false;
                }
                break;
                
            case 'mtime':
                if (!matchesMtime(stats, criterion.value)) {
                    return false;
                }
                break;
        }
    }
    return true;
}

/**
 * Check name pattern match
 * @param {string} filePath - File path
 * @param {string} pattern - Name pattern
 * @returns {boolean} True if matches
 */
function matchesNamePattern(filePath, pattern) {
    const fileName = path.basename(filePath);
    
    const regexPattern = pattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
    
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(fileName);
}

/**
 * Check type match
 * @param {Object} stats - File stats
 * @param {string} type - Type to match
 * @returns {boolean} True if matches
 */
function matchesType(stats, type) {
    switch (type) {
        case 'f':
            return stats.isFile();
        case 'd':
            return stats.isDirectory();
        case 'l':
            return stats.isSymbolicLink();
        default:
            return false;
    }
}

/**
 * Check size match
 * @param {Object} stats - File stats
 * @param {string} size - Size specification
 * @returns {boolean} True if matches
 */
function matchesSize(stats, size) {
    const fileSize = stats.size;
    const sizeStr = size.toString();
    
    if (sizeStr.startsWith('+')) {
        const targetSize = parseSize(sizeStr.slice(1));
        return fileSize > targetSize;
    } else if (sizeStr.startsWith('-')) {
        const targetSize = parseSize(sizeStr.slice(1));
        return fileSize < targetSize;
    } else {
        const targetSize = parseSize(sizeStr);
        return fileSize === targetSize;
    }
}

/**
 * Parse size string (e.g., "1M", "500K", "1024")
 * @param {string} sizeStr - Size string
 * @returns {number} Size in bytes
 */
function parseSize(sizeStr) {
    const match = sizeStr.match(/^(\d+(?:\.\d+)?)([KMG]?)$/i);
    if (!match) return 0;
    
    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase();
    
    switch (unit) {
        case 'K':
            return value * 1024;
        case 'M':
            return value * 1024 * 1024;
        case 'G':
            return value * 1024 * 1024 * 1024;
        default:
            return value;
    }
}

/**
 * Check modification time match
 * @param {Object} stats - File stats
 * @param {string} mtime - Modification time specification
 * @returns {boolean} True if matches
 */
function matchesMtime(stats, mtime) {
    const fileMtime = stats.mtime.getTime();
    const now = Date.now();
    const daysAgo = parseInt(mtime);
    
    if (mtime.startsWith('+')) {
        const targetTime = now - (Math.abs(daysAgo) * 24 * 60 * 60 * 1000);
        return fileMtime < targetTime;
    } else if (mtime.startsWith('-')) {
        const targetTime = now - (Math.abs(daysAgo) * 24 * 60 * 60 * 1000);
        return fileMtime > targetTime;
    } else {    
        const targetTime = now - (daysAgo * 24 * 60 * 60 * 1000);
        const dayStart = new Date(targetTime).setHours(0, 0, 0, 0);
        const dayEnd = new Date(targetTime).setHours(23, 59, 59, 999);
        return fileMtime >= dayStart && fileMtime <= dayEnd;
    }
}

module.exports = find;
