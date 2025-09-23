const os = require('os');

/**
 * Memory Information Command
 * 
 * @param {Array} args - Command arguments (unused)
 * @param {Object} context - Execution context containing cwd, env, etc.
 * @returns {string} - Memory usage and information
 */
function mem(args, context) {
    try {
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        
        const formatBytes = (bytes) => {
            const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
            if (bytes === 0) return '0 Bytes';
            const i = Math.floor(Math.log(bytes) / Math.log(1024));
            return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
        };
        
        const usagePercent = ((usedMem / totalMem) * 100).toFixed(1);
        
        let output = `Memory Information:\n`;
        output += `Total Memory: ${formatBytes(totalMem)}\n`;
        output += `Used Memory: ${formatBytes(usedMem)} (${usagePercent}%)\n`;
        output += `Free Memory: ${formatBytes(freeMem)}\n\n`;
        
        const barLength = 50;
        const usedBars = Math.round((usedMem / totalMem) * barLength);
        const freeBars = barLength - usedBars;
        
        output += `Memory Usage Bar:\n`;
        output += `[${'█'.repeat(usedBars)}${'░'.repeat(freeBars)}] ${usagePercent}%\n\n`;
        
        output += `System Information:\n`;
        output += `Hostname: ${os.hostname()}\n`;
        output += `Uptime: ${Math.floor(os.uptime() / 3600)} hours\n`;
        output += `Node.js Memory Usage:\n`;
        
        const memUsage = process.memoryUsage();
        output += `  RSS: ${formatBytes(memUsage.rss)}\n`;
        output += `  Heap Total: ${formatBytes(memUsage.heapTotal)}\n`;
        output += `  Heap Used: ${formatBytes(memUsage.heapUsed)}\n`;
        output += `  External: ${formatBytes(memUsage.external)}\n`;
        
        return output;
        
    } catch (error) {
        return `mem: ${error.message}`;
    }
}

module.exports = mem;
