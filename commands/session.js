/**
 * Session Information Command
 * 
 * @param {Array} args - Command arguments [info|reset|cleanup]
 * @param {Object} context - Execution context containing cwd, env, etc.
 * @returns {string} - Session information or operation result
 */
function session(args, context) {
    try {
        const command = args[0] || 'info';
        
        switch (command) {
            case 'info':
                const sessionInfo = {
                    sessionId: context.sessionId || 'Unknown',
                    startTime: context.startTime ? new Date(context.startTime).toLocaleString() : 'Unknown',
                    uptime: context.startTime ? Math.floor((Date.now() - new Date(context.startTime).getTime()) / 1000) : 0,
                    commandCount: context.commandCount || 0,
                    currentCwd: context.cwd,
                    tempPathCount: context.tempPaths ? context.tempPaths.length : 0,
                    variableCount: context.variables ? Object.keys(context.variables).length : 0,
                    historyLength: context.history ? context.history.length : 0
                };
                
                let output = `Session Information:\n`;
                output += `  Session ID: ${sessionInfo.sessionId}\n`;
                output += `  Start Time: ${sessionInfo.startTime}\n`;
                output += `  Uptime: ${sessionInfo.uptime} seconds\n`;
                output += `  Commands Executed: ${sessionInfo.commandCount}\n`;
                output += `  Current Directory: ${sessionInfo.currentCwd}\n`;
                output += `  Temporary Paths: ${sessionInfo.tempPathCount}\n`;
                output += `  Session Variables: ${sessionInfo.variableCount}\n`;
                output += `  History Entries: ${sessionInfo.historyLength}\n`;
                
                return output;
                
            case 'reset':
                context.history = [];
                context.variables = {};
                context.tempPaths = [];
                context.commandCount = 0;
                return 'Session reset completed';
                
            case 'cleanup':
                if (context.tempPaths && context.tempPaths.length > 0) {
                    const fs = require('fs-extra');
                    const cleanedPaths = [];
                    
                    for (const tempPath of context.tempPaths) {
                        try {
                            if (fs.existsSync(tempPath)) {
                                fs.removeSync(tempPath);
                                cleanedPaths.push(tempPath);
                            }
                        } catch (error) {
                            console.error(`Error cleaning up temporary path ${tempPath}: ${error.message}`);
                        }
                    }
                    
                    context.tempPaths = [];
                    return `Cleaned up ${cleanedPaths.length} temporary paths`;
                } else {
                    return 'No temporary paths to clean up';
                }
                
            default:
                return `session: unknown command '${command}'. Available: info, reset, cleanup`;
        }
        
    } catch (error) {
        return `session: ${error.message}`;
    }
}

module.exports = session;
