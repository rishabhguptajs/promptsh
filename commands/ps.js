const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

/**
 * Process List Command
 * 
 * @param {Array} args - Command arguments [options]
 * @param {Object} context - Execution context containing cwd, env, etc.
 * @returns {string} - Process list or error message
 */
async function ps(args, context) {
    try {
        let options = 'aux';
        
        for (const arg of args) {
            if (arg.startsWith('-')) {
                options = arg.substring(1);
            }
        }
        
        const { stdout, stderr } = await execAsync(`ps ${options}`);
        
        if (stderr) {
            return `ps: ${stderr}`;
        }
        
        const lines = stdout.split('\n');
        if (lines.length <= 1) {
            return 'No processes found';
        }
        
        let output = lines[0] + '\n';
        output += '-'.repeat(lines[0].length) + '\n';
        
        for (let i = 1; i < lines.length; i++) {
            if (lines[i].trim()) {
                output += lines[i] + '\n';
            }
        }
        
        return output.trim();
        
    } catch (error) {
        try {
            return getNodeProcessInfo();
        } catch (fallbackError) {
            return `ps: ${error.message}`;
        }
    }
}

/**
 * Fallback function to get Node.js process information
 * @returns {string} - Basic process information
 */
function getNodeProcessInfo() {
    const memUsage = process.memoryUsage();
    
    let output = `Process Information (Node.js fallback):\n`;
    output += `PID: ${process.pid}\n`;
    output += `PPID: ${process.ppid}\n`;
    output += `Command: ${process.argv[0]}\n`;
    output += `Arguments: ${process.argv.slice(1).join(' ')}\n`;
    output += `Working Directory: ${process.cwd()}\n`;
    output += `Memory Usage:\n`;
    output += `  RSS: ${Math.round(memUsage.rss / 1024 / 1024)} MB\n`;
    output += `  Heap Total: ${Math.round(memUsage.heapTotal / 1024 / 1024)} MB\n`;
    output += `  Heap Used: ${Math.round(memUsage.heapUsed / 1024 / 1024)} MB\n`;
    output += `  External: ${Math.round(memUsage.external / 1024 / 1024)} MB\n`;
    output += `Uptime: ${Math.round(process.uptime())} seconds\n`;
    
    return output;
}

module.exports = ps;
