const fs = require('fs-extra');
const path = require('path');

/**
 * Remove Files and Directories Command
 * 
 * @param {Array} args - Command arguments [options, fileOrDirectory]
 * @param {Object} context - Execution context containing cwd, env, etc.
 * @returns {string} - Success message or error message
 */
function rm(args, context) {
    try {
        let recursive = false;
        let force = false;
        const targets = [];
        
        for (const arg of args) {
            if (arg.startsWith('-')) {
                if (arg.includes('r') || arg.includes('R')) recursive = true;
                if (arg.includes('f')) force = true;
            } else {
                targets.push(arg);
            }
        }
        
        if (targets.length === 0) {
            return 'rm: missing operand';
        }
        
        const results = [];
        
        for (const target of targets) {
            const fullPath = path.resolve(context.cwd, target);
            
            if (!fs.existsSync(fullPath)) {
                if (!force) {
                    results.push(`rm: ${target}: No such file or directory`);
                }
                continue;
            }
            
            const stats = fs.statSync(fullPath);
            
            try {
                if (stats.isDirectory()) {
                    if (!recursive) {
                        results.push(`rm: ${target}: is a directory`);
                        continue;
                    }
                    fs.removeSync(fullPath);
                    results.push(`Removed directory: ${fullPath}`);
                } else {
                    fs.unlinkSync(fullPath);
                    results.push(`Removed file: ${fullPath}`);
                }
            } catch (error) {
                if (!force) {
                    results.push(`rm: ${target}: ${error.message}`);
                }
            }
        }
        
        return results.join('\n');
        
    } catch (error) {
        return `rm: ${error.message}`;
    }
}

module.exports = rm;
