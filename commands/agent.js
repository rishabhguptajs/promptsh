const { agent } = require('../ai/translator');

/**
 * Agent command - Control AI agent behavior
 * @param {Array} args - Command arguments
 * @param {Object} context - Execution context
 * @returns {Object} - Command result
 */
async function execute(args = [], context = {}) {
    const command = args[0];

    switch (command) {
        case 'status':
            return {
                success: true,
                output: agent.getStatus()
            };

        case 'history':
            const limit = parseInt(args[1]) || 10;
            return {
                success: true,
                output: agent.getHistory(limit)
            };

        case 'preferences':
            return {
                success: true,
                output: agent.getPreferences()
            };

        case 'clear':
            agent.clearHistory();
            return {
                success: true,
                output: 'Agent history cleared'
            };

        case 'help':
        default:
            return {
                success: true,
                output: `AI Agent Commands:
  status      - Show agent status and statistics
  history [n] - Show recent execution history (default 10)
  preferences - Show learned user preferences
  clear       - Clear agent history and memory
  help        - Show this help message

The AI agent learns from your patterns and makes proactive suggestions.
Use natural language like "help me organize my files" to engage agent mode.`
            };
    }
}

module.exports = execute;
