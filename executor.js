const fs = require('fs');
const path = require('path');
const { translator, agent } = require('./ai/translator');
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
     * Update context from command result
     * @param {Object} contextUpdate - Context update object
     */
    updateContextFromCommand(contextUpdate) {
        if (contextUpdate && contextUpdate.cwd) {
            this.context.setCwd(contextUpdate.cwd);
        }
        if (contextUpdate && contextUpdate.variables) {
            for (const [key, value] of Object.entries(contextUpdate.variables)) {
                this.context.setVariable(key, value);
            }
        }
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
     * @returns {Object} - Execution result with success, output, error, contextUpdate
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
                    error: null,
                    contextUpdate: null
                };
            } else if (result && typeof result === 'object') {
                return {
                    success: result.success !== false,
                    output: result.output || result.message || '',
                    error: result.error || null,
                    data: result.data || null,
                    contextUpdate: result.contextUpdate || null
                };
            } else {
                return {
                    success: true,
                    output: String(result ?? ''),
                    error: null,
                    contextUpdate: null
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
     * @param {Object} previousResult - Previous execution result for agent mode
     * @returns {Object} - Execution result
     */
    async execute(input, additionalContext = {}, previousResult = null) {
        const { cmd, args } = this.parseInput(input);

        if (!cmd) {
            return {
                success: false,
                output: 'No command provided',
                error: 'NO_COMMAND'
            };
        }

        // If command exists in registry, execute directly
        if (this.validateCommand(cmd)) {
            return await this.executeCommand(cmd, args, additionalContext);
        }

        // Command not found - INTELLIGENTLY use AI for ANY unrecognized input
        try {
            // Always try agent first for intelligent analysis
            const agentResult = await agent.act(input, this.context, previousResult);

            if (agentResult.success && agentResult.actions && agentResult.actions.length > 0) {
                return await this.executeAgentActions(agentResult, additionalContext);
            }

            // Fallback to translator for simple command translation
            const aiResult = await translator.translate(input, this.context);

            if (aiResult.success && aiResult.commands && aiResult.commands.length > 0) {
                return await this.executeTranslatedCommands(aiResult.commands, additionalContext);
            } else {
                return {
                    success: false,
                    output: aiResult.message || `Unable to interpret: "${input}". Try using more specific language or check available commands: ${this.getAvailableCommands().join(', ')}`,
                    error: 'AI_INTERPRETATION_FAILED'
                };
            }
        } catch (error) {
            return {
                success: false,
                output: `AI interpretation failed for: "${input}". Error: ${error.message}`,
                error: 'AI_ERROR'
            };
        }
    }

    /**
     * Execute agent actions with decision making - FIXED VERSION
     * @param {Object} agentResult - Agent response with actions
     * @param {Object} additionalContext - Additional context
     * @param {boolean} skipConfirmation - Skip confirmation check (used after user confirms)
     * @returns {Object} - Combined execution result
     */
    async executeAgentActions(agentResult, additionalContext = {}, skipConfirmation = false) {
        const results = [];
        let combinedOutput = '';
        let hasErrors = false;
        let confirmationRequired = false;

        // Check if any actions require confirmation (skip if already confirmed)
        if (!skipConfirmation) {
            for (const action of agentResult.actions) {
                if (action.requires_confirmation || action.is_critical) {
                    confirmationRequired = true;
                    break;
                }
            }
        }

        if (confirmationRequired && !skipConfirmation) {
            return {
                success: false,
                output: this.formatConfirmationPrompt(agentResult),
                error: 'CONFIRMATION_REQUIRED',
                data: {
                    agentResult,
                    requiresConfirmation: true
                }
            };
        }

        // Execute commands SEQUENTIALLY, ONE BY ONE
        for (let i = 0; i < agentResult.actions.length; i++) {
            const action = agentResult.actions[i];
            const { cmd, args } = this.parseInput(action.command);


            if (cmd) {
                // Execute the command with UPDATED context
                const currentContext = this.context.toSnapshot();
                
                const result = await this.executeCommand(cmd, args, {
                    ...additionalContext,
                    ...currentContext, // Include current context state
                    agentConfidence: action.confidence,
                    agentExplanation: action.explanation
                });

                results.push({
                    action,
                    command: action.command,
                    result
                });

                // Add to combined output with action explanation
                if (action.explanation) {
                    combinedOutput += `${action.explanation}:\n`;
                }
                
                if (result.output) {
                    combinedOutput += `${result.output}\n\n`;
                }

                if (!result.success) {
                    hasErrors = true;
                    // Log error but continue with remaining commands
                    combinedOutput += `❌ Error: ${result.error}\n\n`;
                }

                // CRITICAL: Update context immediately after each command
                if (result.contextUpdate) {
                    this.updateContextFromCommand(result.contextUpdate);
                }

                // Special handling for cd command - force context update
                if (cmd === 'cd' && result.success) {
                    // Force update the current working directory
                    const newCwd = result.output ? result.output.trim() : null;
                    if (newCwd && newCwd !== (this.context.cwd || this.context.getCwd?.())) {
                        this.context.setCwd(newCwd);
                    }
                }

                // Small delay between commands to ensure proper execution
                if (i < agentResult.actions.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            } else {
                combinedOutput += `⚠️  Could not parse command: ${action.command}\n\n`;
                hasErrors = true;
            }
        }


        const successCount = results.filter(r => r.result.success).length;

        return {
            success: !hasErrors,
            output: combinedOutput.trim(),
            error: hasErrors ? 'SOME_ACTIONS_FAILED' : null,
            data: {
                actions: results,
                totalActions: agentResult.actions.length,
                successfulActions: successCount,
                agentReasoning: agentResult.reasoning,
                agentConfidence: agentResult.confidence
            }
        };
    }

    /**
     * Format confirmation prompt for user
     * @param {Object} agentResult - Agent result requiring confirmation
     * @returns {string} - Formatted confirmation prompt
     */
    formatConfirmationPrompt(agentResult) {
        let prompt = '🤖 Agent wants to execute the following actions:\n\n';

        agentResult.actions.forEach((action, index) => {
            prompt += `${index + 1}. ${action.command}\n`;
            prompt += `   Reason: ${action.explanation}\n`;
            prompt += `   Confidence: ${Math.round(action.confidence * 100)}%\n`;
            if (action.requires_confirmation) {
                prompt += `   ⚠️  REQUIRES CONFIRMATION\n`;
            }
            prompt += '\n';
        });

        prompt += '💡 Reply with:\n';
        prompt += '- "yes" or "y" to approve all actions\n';
        prompt += '- "no" or "n" to cancel\n';
        prompt += '- "skip X" to skip action X\n';
        prompt += '- "modify X: new command" to modify action X\n';

        return prompt;
    }

    /**
     * Handle user confirmation response
     * @param {string} confirmation - User confirmation input
     * @param {Object} agentResult - Original agent result
     * @param {Object} additionalContext - Additional context
     * @returns {Object} - Execution result
     */
    async handleConfirmation(confirmation, agentResult, additionalContext = {}) {
        const lowerConfirmation = confirmation.toLowerCase().trim();

        if (lowerConfirmation === 'no' || lowerConfirmation === 'n') {
            return {
                success: false,
                output: 'Agent actions cancelled by user',
                error: 'USER_CANCELLED'
            };
        }

        if (lowerConfirmation === 'yes' || lowerConfirmation === 'y') {
            return await this.executeAgentActions(agentResult, additionalContext, true);
        }

        // Handle specific action modifications
        if (lowerConfirmation.startsWith('skip ')) {
            const skipIndex = parseInt(lowerConfirmation.split(' ')[1]) - 1;
            const modifiedActions = agentResult.actions.filter((_, index) => index !== skipIndex);
            const modifiedResult = { ...agentResult, actions: modifiedActions };
            return await this.executeAgentActions(modifiedResult, additionalContext, true);
        }

        if (lowerConfirmation.startsWith('modify ')) {
            const parts = confirmation.split(':');
            if (parts.length >= 2) {
                const modifyIndex = parseInt(parts[0].split(' ')[1]) - 1;
                const newCommand = parts.slice(1).join(':').trim();
                
                if (modifyIndex >= 0 && modifyIndex < agentResult.actions.length) {
                    const modifiedActions = [...agentResult.actions];
                    modifiedActions[modifyIndex].command = newCommand;

                    const modifiedResult = { ...agentResult, actions: modifiedActions };
                    return await this.executeAgentActions(modifiedResult, additionalContext, true);
                }
            }
        }

        return {
            success: false,
            output: 'Invalid confirmation response. Use "yes", "no", "skip X", or "modify X: command"',
            error: 'INVALID_CONFIRMATION'
        };
    }

    /**
     * Execute multiple translated commands from AI - SEQUENTIAL EXECUTION
     * @param {Array} commands - Array of command strings from AI translator
     * @param {Object} additionalContext - Additional context to pass
     * @returns {Object} - Combined execution result
     */
    async executeTranslatedCommands(commands, additionalContext = {}) {
        const results = [];
        let combinedOutput = '';
        let hasErrors = false;

        // Execute commands ONE BY ONE
        for (let i = 0; i < commands.length; i++) {
            const commandString = commands[i];
            const { cmd, args } = this.parseInput(commandString);

        

            if (cmd) {
                const result = await this.executeCommand(cmd, args, additionalContext);
                results.push({
                    command: commandString,
                    result
                });

                

                if (result.output) {
                    combinedOutput += `${result.output}\n`;
                }

                if (!result.success) {
                    hasErrors = true;
                }

                // Update context after each command
                if (result.contextUpdate) {
                    this.updateContextFromCommand(result.contextUpdate);
                }

                // Small delay between commands
                if (i < commands.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
        }

        const successCount = results.filter(r => r.result.success).length;

        return {
            success: !hasErrors,
            output: combinedOutput.trim(),
            error: hasErrors ? 'SOME_COMMANDS_FAILED' : null,
            data: {
                commands: results,
                totalCommands: commands.length,
                successfulCommands: successCount
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
