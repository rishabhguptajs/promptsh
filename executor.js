const fs = require('fs');
const path = require('path');
const { translator } = require('./ai/translator');
const Context = require('./utils/context');

/**
 * Executor Module - Central hub for command routing and execution
 * 
 * Responsibilities:
 * - Parse input commands into command and arguments
 * - Maintain command registry mapping
 * - Validate command existence
 * - Execute commands with context
 * - Return formatted output
 */
class Executor {
    constructor() {
        this.commandRegistry = new Map();
        this.context = new Context();
        this.initializeCommandRegistry();
    }

    /**
     * Initialize the command registry by loading all command modules
     */
    initializeCommandRegistry() {
        const commandsDir = path.join(__dirname, 'commands');
        
        try {
            const commandFiles = fs.readdirSync(commandsDir);
            
            commandFiles.forEach(file => {
                if (file.endsWith('.js')) {
                    const commandName = path.basename(file, '.js');
                    const commandPath = path.join(commandsDir, file);
                    
                    try {
                        const commandModule = require(commandPath);
                        
                        if (typeof commandModule === 'function') {
                            this.commandRegistry.set(commandName, commandModule);
                        } else if (commandModule && typeof commandModule.execute === 'function') {
                            this.commandRegistry.set(commandName, commandModule.execute);
                        } else if (commandModule && typeof commandModule.default === 'function') {
                            this.commandRegistry.set(commandName, commandModule.default);
                        }
                    } catch (error) {
                        console.warn(`Warning: Could not load command '${commandName}': ${error.message}`);
                    }
                }
            });
        } catch (error) {
            console.warn(`Warning: Could not read commands directory: ${error.message}`);
        }
    }

    /**
     * Parse input string into command and arguments
     * @param {string} input - Raw command string
     * @returns {Object} - Parsed command object with cmd and args
     */
    parseInput(input) {
        if (!input || typeof input !== 'string') {
            return { cmd: '', args: [] };
        }

        const parts = input.trim().split(/\s+/);
        
        if (parts.length === 0 || parts[0] === '') {
            return { cmd: '', args: [] };
        }

        const cmd = parts[0];
        const args = parts.slice(1);

        return { cmd, args };
    }

    /**
     * Validate if a command exists in the registry
     * @param {string} commandName - Name of the command to validate
     * @returns {boolean} - True if command exists, false otherwise
     */
    validateCommand(commandName) {
        return this.commandRegistry.has(commandName);
    }

    /**
     * Get list of available commands
     * @returns {Array} - Array of available command names
     */
    getAvailableCommands() {
        return Array.from(this.commandRegistry.keys()).sort();
    }

    /**
     * Update context (e.g., current working directory)
     * @param {Object} updates - Object containing context updates
     */
    updateContext(updates) {
        if (updates.cwd) {
            this.context.setCwd(updates.cwd);
        }
        if (updates.env) {
            this.context.env = { ...this.context.env, ...updates.env };
        }
    }

    /**
     * Execute a command with given arguments and context
     * @param {string} commandName - Name of the command to execute
     * @param {Array} args - Command arguments
     * @param {Object} additionalContext - Additional context to pass
     * @returns {Object} - Execution result with success, output, and error
     */
    async executeCommand(commandName, args = [], additionalContext = {}) {
        try {
            if (!this.validateCommand(commandName)) {
                return {
                    success: false,
                    output: `Command '${commandName}' not found. Available commands: ${this.getAvailableCommands().join(', ')}`,
                    error: 'COMMAND_NOT_FOUND'
                };
            }

            const commandFunction = this.commandRegistry.get(commandName);
            
            const executionContext = {
                ...this.context.toSnapshot(),
                ...additionalContext,
                args,
                commandName
            };

            const result = await commandFunction(args, executionContext);

            this.context.addToHistory(commandName, args, result);

            if (typeof result === 'string') {
                return {
                    success: true,
                    output: result,
                    error: null
                };
            } else if (result && typeof result === 'object') {
                return {
                    success: result.success !== false,
                    output: result.output || result.message || '',
                    error: result.error || null,
                    data: result.data || null
                };
            } else {
                return {
                    success: true,
                    output: String(result || ''),
                    error: null
                };
            }

        } catch (error) {
            return {
                success: false,
                output: `Error executing command '${commandName}': ${error.message}`,
                error: error.message
            };
        }
    }

    /**
     * Main execution method - parse input and execute command
     * @param {string} input - Raw command string
     * @param {Object} additionalContext - Additional context to pass
     * @returns {Object} - Execution result
     */
    async execute(input, additionalContext = {}) {
        const { cmd, args } = this.parseInput(input);
        
        if (!cmd) {
            return {
                success: false,
                output: 'No command provided',
                error: 'NO_COMMAND'
            };
        }

        if (!this.validateCommand(cmd)) {
            try {
                const aiResult = await translator.translate(input, this.context);
                
                if (aiResult.success && aiResult.commands && aiResult.commands.length > 0) {
                    return await this.executeTranslatedCommands(aiResult.commands, additionalContext);
                } else {
                    return {
                        success: false,
                        output: aiResult.message || `Command '${cmd}' not found. Available commands: ${this.getAvailableCommands().join(', ')}`,
                        error: 'COMMAND_NOT_FOUND'
                    };
                }
            } catch (error) {
                return {
                    success: false,
                    output: `Command '${cmd}' not found. Available commands: ${this.getAvailableCommands().join(', ')}`,
                    error: 'COMMAND_NOT_FOUND'
                };
            }
        } else {
            return await this.executeCommand(cmd, args, additionalContext);
        }
    }

    /**
     * Execute multiple translated commands from AI
     * @param {Array} commands - Array of command strings from AI translator
     * @param {Object} additionalContext - Additional context to pass
     * @returns {Object} - Combined execution result
     */
    async executeTranslatedCommands(commands, additionalContext = {}) {
        const results = [];
        let combinedOutput = '';
        let hasErrors = false;

        for (const commandString of commands) {
            const { cmd, args } = this.parseInput(commandString);
            
            if (cmd) {
                const result = await this.executeCommand(cmd, args, additionalContext);
                results.push({
                    command: commandString,
                    result
                });
                
                combinedOutput += `${commandString}: ${result.output}\n`;
                
                if (!result.success) {
                    hasErrors = true;
                }
            }
        }

        return {
            success: !hasErrors,
            output: combinedOutput.trim(),
            error: hasErrors ? 'SOME_COMMANDS_FAILED' : null,
            data: {
                commands: results,
                totalCommands: commands.length,
                successfulCommands: results.filter(r => r.result.success).length
            }
        };
    }

    /**
     * Get current context
     * @returns {Object} - Current context object
     */
    getContext() {
        return this.context.toSnapshot();
    }

    /**
     * Get command history
     * @param {number} limit - Maximum number of entries to return
     * @returns {Array} - Array of command history entries
     */
    getHistory(limit = null) {
        return this.context.getHistory(limit);
    }

    /**
     * Clear command history
     */
    clearHistory() {
        this.context.clearHistory();
    }

    /**
     * Get session information
     * @returns {Object} - Session information
     */
    getSessionInfo() {
        return this.context.getSessionInfo();
    }

    /**
     * Set a session variable
     * @param {string} key - Variable name
     * @param {any} value - Variable value
     */
    setVariable(key, value) {
        this.context.setVariable(key, value);
    }

    /**
     * Get a session variable
     * @param {string} key - Variable name
     * @param {any} defaultValue - Default value if key doesn't exist
     * @returns {any} - Variable value or default
     */
    getVariable(key, defaultValue = null) {
        return this.context.getVariable(key, defaultValue);
    }

    /**
     * Get all session variables
     * @returns {Object} - Object containing all variables
     */
    getAllVariables() {
        return this.context.getAllVariables();
    }

    /**
     * Add a temporary path to track
     * @param {string} tempPath - Temporary file or directory path
     */
    addTempPath(tempPath) {
        this.context.addTempPath(tempPath);
    }

    /**
     * Clean up all temporary paths
     * @returns {Array} - Array of cleaned up paths
     */
    cleanupTempPaths() {
        return this.context.cleanupTempPaths();
    }
}

const executor = new Executor();

module.exports = {
    Executor,
    executor
};
