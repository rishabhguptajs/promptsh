/**
 * Autocomplete Command - Manage and test autocomplete functionality
 * 
 * Usage:
 * - autocomplete test <input> - Test autocomplete with given input
 * - autocomplete status - Show autocomplete status and cache info
 * - autocomplete clear - Clear autocomplete cache
 * - autocomplete enable/disable - Enable or disable autocomplete
 */
async function autocomplete(args, context) {
    const { executor } = require('../executor');
    const { AutocompleteService } = require('../ai/autocomplete');
    
    if (args.length === 0) {
        return {
            success: false,
            output: `Usage: autocomplete <command>
Commands:
  test <input>     - Test autocomplete with given input
  status          - Show autocomplete status and cache info
  clear           - Clear autocomplete cache
  help            - Show this help message`,
            error: 'INVALID_ARGS'
        };
    }

    const command = args[0].toLowerCase();
    const autocompleteService = new AutocompleteService();

    try {
        switch (command) {
            case 'test':
                if (args.length < 2) {
                    return {
                        success: false,
                        output: 'Usage: autocomplete test <input>',
                        error: 'MISSING_INPUT'
                    };
                }
                
                const input = args.slice(1).join(' ');
                const testContext = {
                    cwd: context.cwd,
                    history: executor.getHistory(5),
                    variables: executor.getAllVariables()
                };
                
                const suggestions = await autocompleteService.generateSuggestions(
                    input, 
                    testContext, 
                    'next_word'
                );
                
                return {
                    success: true,
                    output: `Input: "${input}"\nSuggestions: ${suggestions.join(', ') || 'None'}`,
                    data: {
                        input,
                        suggestions,
                        count: suggestions.length
                    }
                };

            case 'status':
                const isAvailable = await autocompleteService.isOllamaAvailable();
                const models = await autocompleteService.getAvailableModels();
                const cacheStats = autocompleteService.getCacheStats();
                
                let statusOutput = `Autocomplete Status:
- Ollama Available: ${isAvailable ? '✅ Yes' : '❌ No'}
- Model: ${autocompleteService.model}
- Cache Size: ${cacheStats.size} entries
- Cache Timeout: ${cacheStats.maxAge}ms`;

                if (models.length > 0) {
                    statusOutput += `\n- Available Models: ${models.map(m => m.name).join(', ')}`;
                }

                return {
                    success: true,
                    output: statusOutput,
                    data: {
                        ollamaAvailable: isAvailable,
                        model: autocompleteService.model,
                        cacheStats,
                        availableModels: models
                    }
                };

            case 'clear':
                autocompleteService.clearCache();
                return {
                    success: true,
                    output: 'Autocomplete cache cleared successfully',
                    data: { cacheCleared: true }
                };

            case 'help':
                return {
                    success: true,
                    output: `Autocomplete Command Help:

This command manages the AI-powered autocomplete functionality using Ollama with the gemma3:1b model.

Commands:
  test <input>     - Test autocomplete suggestions for given input
  status          - Show autocomplete service status and configuration
  clear           - Clear the suggestion cache
  help            - Show this help message

Keyboard Shortcuts:
  Tab             - Trigger command/argument completion
  Ctrl+Space      - Get next word suggestions
  Escape          - Clear current suggestions

The autocomplete system uses your command history, current directory, and session variables to provide context-aware suggestions.`,
                    data: { help: true }
                };

            default:
                return {
                    success: false,
                    output: `Unknown command: ${command}. Use 'autocomplete help' for usage information.`,
                    error: 'UNKNOWN_COMMAND'
                };
        }
    } catch (error) {
        return {
            success: false,
            output: `Error: ${error.message}`,
            error: error.message
        };
    }
}

module.exports = autocomplete;
