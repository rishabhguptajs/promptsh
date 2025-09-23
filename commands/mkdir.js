const fs = require('fs-extra');
const path = require('path');

/**
 * Make Directory Command
 * 
 * @param {Array} args - Command arguments [options, directoryName]
 * @param {Object} context - Execution context containing cwd, env, etc.
 * @returns {string} - Success message or error message
 */
function mkdir(args, context) {
    try {
        let recursive = false;
        const directories = [];
        
        for (const arg of args) {
            if (arg.startsWith('-')) {
                if (arg.includes('p')) recursive = true;
            } else {
                directories.push(arg);
            }
        }
        
        if (directories.length === 0) {
            return 'mkdir: missing operand';
        }
        
        const results = [];
        
        for (const dirName of directories) {
            const fullPath = path.resolve(context.cwd, dirName);
            
            if (fs.existsSync(fullPath)) {
                const stats = fs.statSync(fullPath);
                if (stats.isDirectory()) {
                    if (!recursive) {
                        results.push(`mkdir: ${dirName}: File exists`);
                        continue;
                    }
                } else {
                    results.push(`mkdir: ${dirName}: File exists`);
                    continue;
                }
            }
            
            try {
                if (recursive) {
                    fs.ensureDirSync(fullPath);
                } else {
                    fs.mkdirSync(fullPath);
                }
                results.push(`Created directory: ${fullPath}`);
            } catch (error) {
                if (error.code === 'ENOENT' && !recursive) {
                    results.push(`mkdir: ${dirName}: No such file or directory`);
                } else {
                    results.push(`mkdir: ${dirName}: ${error.message}`);
                }
            }
        }
        
        return results.join('\n');
        
    } catch (error) {
        return `mkdir: ${error.message}`;
    }
}

module.exports = mkdir;
