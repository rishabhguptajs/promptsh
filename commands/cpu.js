const os = require('os');

/**
 * CPU Information Command
 * 
 * @param {Array} args - Command arguments (unused)
 * @param {Object} context - Execution context containing cwd, env, etc.
 * @returns {string} - CPU usage and information
 */
function cpu(args, context) {
    try {
        const cpus = os.cpus();
        const loadAvg = os.loadavg();
        
        let output = `CPU Information:\n`;
        output += `Architecture: ${os.arch()}\n`;
        output += `Platform: ${os.platform()}\n`;
        output += `CPU Count: ${cpus.length}\n\n`;
        
        output += `Load Average (1m, 5m, 15m):\n`;
        output += `  ${loadAvg[0].toFixed(2)}, ${loadAvg[1].toFixed(2)}, ${loadAvg[2].toFixed(2)}\n\n`;
        
        output += `CPU Details:\n`;
        cpus.forEach((cpu, index) => {
            output += `  CPU ${index}:\n`;
            output += `    Model: ${cpu.model}\n`;
            output += `    Speed: ${cpu.speed} MHz\n`;
            output += `    Times:\n`;
            output += `      User: ${cpu.times.user}ms\n`;
            output += `      Nice: ${cpu.times.nice}ms\n`;
            output += `      Sys: ${cpu.times.sys}ms\n`;
            output += `      Idle: ${cpu.times.idle}ms\n`;
            output += `      IRQ: ${cpu.times.irq}ms\n`;
        });
        
        return output;
        
    } catch (error) {
        return `cpu: ${error.message}`;
    }
}

module.exports = cpu;
