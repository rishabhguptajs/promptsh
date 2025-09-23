const fs = require('fs-extra');
const path = require('path');

/**
 * List Directory Contents Command
 * 
 * @param {Array} args - Command arguments [options, targetDirectory]
 * @param {Object} context - Execution context containing cwd, env, etc.
 * @returns {string} - Directory listing or error message
 */
function ls(args, context) {
    try {
        let targetDir = context.cwd;
        let showHidden = false;
        let longFormat = false;
        
        for (const arg of args) {
            if (arg.startsWith('-')) {
                if (arg.includes('a')) showHidden = true;
                if (arg.includes('l')) longFormat = true;
            } else {
                targetDir = path.resolve(context.cwd, arg);
            }
        }
        
        if (!fs.existsSync(targetDir)) {
            return `ls: ${targetDir}: No such file or directory`;
        }
        
        const stats = fs.statSync(targetDir);
        if (!stats.isDirectory()) {
            return `ls: ${targetDir}: Not a directory`;
        }
        
        const items = fs.readdirSync(targetDir);
        
        const visibleItems = showHidden ? items : items.filter(item => !item.startsWith('.'));
        
        if (longFormat) {
            const detailedItems = visibleItems.map(item => {
                const itemPath = path.join(targetDir, item);
                const itemStats = fs.statSync(itemPath);
                
                const permissions = getPermissions(itemStats);
                const size = itemStats.size;
                const modified = itemStats.mtime.toLocaleDateString();
                const type = itemStats.isDirectory() ? 'd' : '-';
                
                return `${type}${permissions} ${size.toString().padStart(8)} ${modified} ${item}`;
            });
            
            return detailedItems.join('\n');
        } else {
            return visibleItems.join(' ');
        }
        
    } catch (error) {
        return `ls: ${error.message}`;
    }
}

/**
 * Get file permissions string
 * @param {Object} stats - File stats object
 * @returns {string} - Permissions string (e.g., "rwxr-xr-x")
 */
function getPermissions(stats) {
    const mode = stats.mode;
    const permissions = [];
    
    permissions.push(mode & 0o400 ? 'r' : '-');
    permissions.push(mode & 0o200 ? 'w' : '-');
    permissions.push(mode & 0o100 ? 'x' : '-');
    
    permissions.push(mode & 0o040 ? 'r' : '-');
    permissions.push(mode & 0o020 ? 'w' : '-');
    permissions.push(mode & 0o010 ? 'x' : '-');
    
    permissions.push(mode & 0o004 ? 'r' : '-');
    permissions.push(mode & 0o002 ? 'w' : '-');
    permissions.push(mode & 0o001 ? 'x' : '-');
    
    return permissions.join('');
}

module.exports = ls;
