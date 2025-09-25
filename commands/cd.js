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
            return {
                success: false,
                output: `cd: ${targetDir}: No such file or directory`,
                error: 'DIRECTORY_NOT_FOUND'
            };
        }
        
        const stats = fs.statSync(fullPath);
        if (!stats.isDirectory()) {
            return {
                success: false,
                output: `cd: ${targetDir}: Not a directory`,
                error: 'NOT_A_DIRECTORY'
            };
        }
        
        context.cwd = fullPath;
        
        return {
            success: true,
            output: fullPath,
            contextUpdate: {
                cwd: fullPath
            }
        };
        
    } catch (error) {
        return {
            success: false,
            output: `cd: ${error.message}`,
            error: 'EXECUTION_ERROR'
        };
    }
}

module.exports = cd;
