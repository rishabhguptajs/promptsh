const fs = require('fs-extra');
const path = require('path');

/**
 * Move/Rename Files and Directories Command
 * 
 * @param {Array} args - Command arguments [source, destination]
 * @param {Object} context - Execution context containing cwd, env, etc.
 * @returns {string} - Success message or error message
 */
function mv(args, context) {
    try {
        if (args.length < 2) {
            return 'mv: missing file operand';
        }
        
        const source = args[args.length - 2];
        const destination = args[args.length - 1];
        
        const sourcePath = path.resolve(context.cwd, source);
        const destPath = path.resolve(context.cwd, destination);
        
        if (!fs.existsSync(sourcePath)) {
            return `mv: ${source}: No such file or directory`;
        }
        
        if (fs.existsSync(destPath)) {
            const destStats = fs.statSync(destPath);
            if (destStats.isDirectory()) {
                const fileName = path.basename(sourcePath);
                const finalDestPath = path.join(destPath, fileName);
                
                if (fs.existsSync(finalDestPath)) {
                    return `mv: ${finalDestPath}: File exists`;
                }
                
                fs.moveSync(sourcePath, finalDestPath);
                return `Moved ${sourcePath} to ${finalDestPath}`;
            } else {
                fs.moveSync(sourcePath, destPath);
                return `Moved ${sourcePath} to ${destPath}`;
            }
        } else {
            const destDir = path.dirname(destPath);
            
            if (!fs.existsSync(destDir)) {
                return `mv: ${destination}: No such file or directory`;
            }
            
            fs.moveSync(sourcePath, destPath);
            return `Moved ${sourcePath} to ${destPath}`;
        }
        
    } catch (error) {
        return `mv: ${error.message}`;
    }
}

module.exports = mv;
