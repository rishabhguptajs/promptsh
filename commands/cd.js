const fs = require('fs-extra');
const path = require('path');

/**
 * Change Directory Command
 * 
 * @param {Array} args - Command arguments [targetDirectory]
 * @param {Object} context - Execution context containing cwd, env, etc.
 * @returns {string} - New directory path or error message
 */
function cd(args, context) {
    try {
        const targetDir = args[0] || process.env.HOME || '/';
        
        const fullPath = path.resolve(context.cwd, targetDir);
        
        if (!fs.existsSync(fullPath)) {
            return `cd: ${targetDir}: No such file or directory`;
        }
        
        const stats = fs.statSync(fullPath);
        if (!stats.isDirectory()) {
            return `cd: ${targetDir}: Not a directory`;
        }
        
        context.cwd = fullPath;
        
        return fullPath;
        
    } catch (error) {
        return `cd: ${error.message}`;
    }
}

module.exports = cd;
