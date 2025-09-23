/**
 * Command History Command
 * 
 * @param {Array} args - Command arguments [options]
 * @param {Object} context - Execution context containing cwd, env, etc.
 * @returns {string} - Command history or error message
 */
function history(args, context) {
    try {
        let limit = null;
        let clear = false;
        
        for (const arg of args) {
            if (arg === '-c' || arg === '--clear') {
                clear = true;
            } else if (arg.startsWith('-n') && arg.length > 2) {
                limit = parseInt(arg.substring(2));
            } else if (!isNaN(parseInt(arg))) {
                limit = parseInt(arg);
            }
        }
        
        if (clear) {
            context.history = [];
            return 'Command history cleared';
        }
        
        const history = context.history || [];
        
        if (history.length === 0) {
            return 'No command history available';
        }
        
        let output = '';
        const startIndex = limit ? Math.max(0, history.length - limit) : 0;
        const relevantHistory = history.slice(startIndex);
        
        relevantHistory.forEach((entry, index) => {
            const actualIndex = startIndex + index;
            const timestamp = entry.timestamp ? new Date(entry.timestamp).toLocaleString() : 'Unknown';
            const command = entry.command || 'Unknown';
            const args = entry.args ? entry.args.join(' ') : '';
            const fullCommand = args ? `${command} ${args}` : command;
            
            output += `${actualIndex.toString().padStart(4)}  ${timestamp}  ${fullCommand}\n`;
        });
        
        return output.trim();
        
    } catch (error) {
        return `history: ${error.message}`;
    }
}

module.exports = history;
