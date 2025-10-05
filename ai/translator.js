const axios = require('axios');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

/**
 * AI Agent Module - Proactive AI agent that suggests and executes next steps
 * 
 * Responsibilities:
 * - Convert natural language to shell commands
 * - Analyze results and suggest next steps
 * - Execute multi-step workflows autonomously
 * - Learn from user feedback and patterns
 * - Make intelligent decisions about when to ask vs proceed
 */
class AIAgent {
    constructor() {
        this.apiKey = process.env.OPENROUTER_API_KEY;
        this.apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
        this.model = 'meta-llama/llama-4-maverick:free';
        
        this.commandWhitelist = new Set([
            'mkdir', 'mv', 'rm', 'ls', 'cd', 'pwd', 'cp', 'cat', 'echo', 
            'grep', 'find', 'head', 'tail', 'sort', 'wc', 'touch', 'chmod',
            'chown', 'ps', 'top', 'df', 'du', 'free', 'uname', 'whoami',
            'date', 'cal', 'which', 'whereis', 'file', 'stat', 'history'
        ]);
        
        this.dangerousPatterns = [
            /rm\s+-rf\s+\//,  // rm -rf /
            /rm\s+-rf\s+\/\w*/, // rm -rf /anything
            /rm\s+-rf\s+\.\./, // rm -rf ..
            /rm\s+-rf\s+\.\.\//, // rm -rf ../
            /chmod\s+777\s+\//, // chmod 777 /
            /chown\s+\w+:\w+\s+\//, // chown user:group /
            /dd\s+if=/, // dd command
            /mkfs/, // filesystem creation
            /fdisk/, // disk partitioning
            /format/, // formatting
            />\s*\/dev\/sd/, // redirecting to disk devices
            /:\s*\(\)\s*{/, // function definitions that could be malicious
        ];

        this.workflowMemory = new Map(); // Store workflow state
        this.userPreferences = new Map(); // Store user preferences
        this.executionHistory = []; // Track execution patterns
    }

    /**
     * Main agent method - analyze context and suggest/proceed with next steps
     * @param {string} input - User input
     * @param {Object} context - Execution context
     * @param {Object} previousResult - Previous command result
     * @returns {Object} - Agent response with actions and suggestions
     */
    async act(input, context = {}, previousResult = null) {
        try {
            // Check for API key first - NO FALLBACKS
            if (!this.apiKey) {
                return {
                    success: false,
                    message: 'OpenRouter API key not configured. Set OPENROUTER_API_KEY environment variable.',
                    actions: []
                };
            }

            this.updateWorkflowMemory(context, previousResult);

            const agentPrompt = this.buildAgentPrompt(input, context, previousResult);

            const response = await this.callOpenRouterAPI(agentPrompt);

            if (!response.success) {
                
                return {
                    success: false,
                    message: `AI Agent failed: ${response.message}`,
                    actions: []
                };
            }

            if (!response.content) {
                
                return {
                    success: false,
                    message: 'AI Agent received empty response from API',
                    actions: []
                };
            }

            
            const parsedResponse = this.parseAgentResponse(response.content);
            const validatedActions = this.validateActions(parsedResponse.actions);

            if (validatedActions.length === 0) {
                return {
                    success: false,
                    message: 'AI Agent could not generate valid commands from the input',
                    actions: []
                };
            }

            return {
                success: true,
                actions: validatedActions,
                suggestions: parsedResponse.suggestions || [],
                reasoning: parsedResponse.reasoning || '',
                confidence: parsedResponse.confidence || 0.95
            };

        } catch (error) {
            return {
                success: false,
                message: `AI Agent error: ${error.message}`,
                actions: []
            };
        }
    }


    /**
     * Build agent prompt with context awareness and decision-making
     * @param {string} input - User input
     * @param {Object} context - Execution context
     * @param {Object} previousResult - Previous command result
     * @returns {string} - Formatted agent prompt
     */
    buildAgentPrompt(input, context, previousResult) {
        const cwd = context.cwd || process.cwd();
        const availableCommands = Array.from(this.commandWhitelist).join(', ');

        return `You are a DEVELOPER ASSISTANT AI that converts natural language requests into safe shell commands for software development tasks.

**CONTEXT:**
- Current working directory: ${cwd}
- Available safe commands: ${availableCommands}
- Purpose: Help developers with file management, navigation, and system tasks

**IMPORTANT SAFETY RULES:**
1. ONLY use commands from this approved list: ${availableCommands}
2. Generate SAFE, NON-DESTRUCTIVE commands by default
3. For file removal operations, require explicit confirmation
4. Parse developer requests accurately and helpfully

**COMMON DEVELOPER REQUESTS:**
- Navigation: "go to folder X", "cd to X", "change directory to X"
- File listing: "show files", "list contents", "see what's here"
- File management: "copy file A to B", "move file A to B", "create folder X"
- Search: "find files with X", "search for Y", "locate Z"

**User Request:** "${input}"
${previousResult ? `**Previous Result:** ${JSON.stringify(previousResult, null, 2)}` : ''}

**EXAMPLES:**
Input: "go to the ai folder and list all files"
Output: ["cd ai", "ls -la"]

Input: "create a backup of my documents"
Output: ["mkdir -p ~/backups", "cp -r ~/Documents ~/backups/"]

Input: "find all js files"
Output: ["find . -name "*.js" -type f"]

Input: "make a new folder called projects"
Output: ["mkdir -p projects"]

**REQUIRED JSON RESPONSE FORMAT:**
{
  "actions": [
    {
      "command": "exact_shell_command_here",
      "explanation": "brief description of what this does",
      "confidence": 0.95,
      "requires_confirmation": false,
      "is_critical": false
    }
  ],
  "suggestions": [],
  "reasoning": "How I interpreted the request",
  "confidence": 0.95,
  "should_ask_user": false
}

**IMPORTANT:** Always return valid JSON with executable commands from the approved list.`;
    }

    /**
     * Parse agent response from AI
     * @param {string} content - Raw AI response
     * @returns {Object} - Parsed agent response
     */
    parseAgentResponse(content) {
        try {
            // Strip markdown code blocks if present
            let cleanContent = content.trim();
            if (cleanContent.startsWith('```json') && cleanContent.endsWith('```')) {
                cleanContent = cleanContent.slice(7, -3).trim();
            } else if (cleanContent.startsWith('```') && cleanContent.endsWith('```')) {
                cleanContent = cleanContent.slice(3, -3).trim();
            }
            return JSON.parse(cleanContent);
        } catch (error) {
            // Fallback parsing for non-JSON responses
            const fallback = this.parseFallbackResponse(content);
            return fallback;
        }
    }

    /**
     * Parse fallback response when AI doesn't return JSON
     * @param {string} content - Raw response content
     * @returns {Object} - Fallback parsed response
     */
    parseFallbackResponse(content) {
        const lines = content.split('\n').filter(line => line.trim());
        
        return {
            actions: [],
            suggestions: lines.map(line => ({
                action: line,
                reasoning: 'Extracted from agent response',
                confidence: 0.6
            })),
            reasoning: content,
            confidence: 0.5,
            should_ask_user: true
        };
    }

    /**
     * Validate agent actions against safety rules
     * @param {Array} actions - Actions to validate
     * @returns {Array} - Validated actions
     */
    validateActions(actions) {
        if (!Array.isArray(actions)) return [];

        return actions.filter(action => {
            if (!action.command || typeof action.command !== 'string') return false;
            
            const command = action.command.trim();
            if (!command) return false;

            const baseCommand = command.split(/\s+/)[0];
            if (!this.commandWhitelist.has(baseCommand)) return false;
            
            if (this.isDangerousCommand(command)) return false;
            
            return true;
        }).map(action => ({
            ...action,
            requires_confirmation: action.requires_confirmation || this.shouldRequireConfirmation(action.command)
        }));
    }

    /**
     * Determine if a command should require confirmation
     * @param {string} command - Command to check
     * @returns {boolean} - True if confirmation needed
     */
    shouldRequireConfirmation(command) {
        const dangerousWords = ['rm', 'rmdir', 'del', 'format', 'mkfs', 'dd'];
        const baseCommand = command.split(/\s+/)[0];
        
        return dangerousWords.includes(baseCommand) || 
               command.includes('-rf') || 
               command.includes('--force');
    }

    /**
     * Update workflow memory with new information
     * @param {Object} context - Current context
     * @param {Object} result - Previous result
     */
    updateWorkflowMemory(context, result) {
        this.executionHistory.push({
            timestamp: new Date().toISOString(),
            context: context.cwd,
            result: result ? result.success : false,
            output: result ? result.output : ''
        });

        // Keep only last 50 entries
        if (this.executionHistory.length > 50) {
            this.executionHistory = this.executionHistory.slice(-50);
        }
    }

    /**
     * Get recent execution history
     * @param {number} limit - Number of entries to return
     * @returns {Array} - Recent history entries
     */
    getRecentHistory(limit = 10) {
        return this.executionHistory.slice(-limit).map(entry => 
            `${entry.context}: ${entry.result ? 'SUCCESS' : 'FAILED'}`
        );
    }

    /**
     * Learn from user feedback
     * @param {string} feedbackType - Type of feedback (approve, reject, modify)
     * @param {Object} context - Context when feedback was given
     */
    learnFromFeedback(feedbackType, context) {
        // Store user preferences for future decision making
        this.userPreferences.set(feedbackType, {
            timestamp: new Date().toISOString(),
            context: context.cwd,
            ...context
        });
    }

    // ... existing code ...

    /**
     * Get the command whitelist
     * @returns {Set} - Set of allowed commands
     */
    getCommandWhitelist() {
        return new Set(this.commandWhitelist);
    }

    /**
     * Add a command to the whitelist
     * @param {string} command - Command to add
     */
    addToWhitelist(command) {
        this.commandWhitelist.add(command);
    }

    /**
     * Remove a command from the whitelist
     * @param {string} command - Command to remove
     */
    removeFromWhitelist(command) {
        this.commandWhitelist.delete(command);
    }

    /**
     * Get agent status and statistics
     * @returns {string} - Formatted status information
     */
    getStatus() {
        const totalExecutions = this.executionHistory.length;
        const successfulExecutions = this.executionHistory.filter(e => e.result).length;
        const successRate = totalExecutions > 0 ? (successfulExecutions / totalExecutions * 100).toFixed(1) : 0;

        return `🤖 AI Agent Status:
- Total executions: ${totalExecutions}
- Success rate: ${successRate}%
- Workflow memory: ${this.workflowMemory.size} active workflows
- User preferences: ${this.userPreferences.size} learned patterns
- Command whitelist: ${this.commandWhitelist.size} allowed commands`;
    }

    /**
     * Get recent execution history
     * @param {number} limit - Number of entries to return
     * @returns {string} - Formatted history
     */
    getHistory(limit = 10) {
        const recent = this.executionHistory.slice(-limit);

        if (recent.length === 0) {
            return 'No execution history available';
        }

        let output = '📋 Recent Agent Executions:\n';
        recent.forEach((entry, index) => {
            const timestamp = new Date(entry.timestamp).toLocaleString();
            const status = entry.result ? '✅' : '❌';
            output += `${index + 1}. ${status} ${timestamp} - ${entry.context}\n`;
        });

        return output;
    }

    /**
     * Get learned user preferences
     * @returns {string} - Formatted preferences
     */
    getPreferences() {
        if (this.userPreferences.size === 0) {
            return 'No user preferences learned yet. The agent will learn from your patterns over time.';
        }

        let output = '🧠 Learned User Preferences:\n';
        let index = 1;
        for (const [key, value] of this.userPreferences) {
            const timestamp = new Date(value.timestamp).toLocaleString();
            output += `${index}. ${key} - ${timestamp}\n`;
            index++;
        }

        return output;
    }

    /**
     * Clear agent history and memory
     */
    clearHistory() {
        this.executionHistory = [];
        this.userPreferences.clear();
        // Keep workflow memory but clear old entries
        for (const [key, workflow] of this.workflowMemory) {
            if (Date.now() - new Date(workflow.lastUpdated) > 24 * 60 * 60 * 1000) {
                this.workflowMemory.delete(key);
            }
        }
    }

    /**
     * Call OpenRouter API with the prompt
     * @param {string} prompt - The prompt to send
     * @returns {Object} - API response
     */
    async callOpenRouterAPI(prompt) {
        try {
            const response = await axios.post(this.apiUrl, {
                model: this.model,
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.1,
                max_tokens: 1000
            }, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'http://localhost:3000',
                    'X-Title': 'PromptSH'
                },
                timeout: 10000
            });

            const content = response.data.choices[0].message.content.trim();

            try {
                const parsed = JSON.parse(content);
                return {
                    success: true,
                    content: content,
                    actions: parsed.actions || [],
                    explanation: parsed.explanation || ''
                };
            } catch (parseError) {
                const commands = this.extractCommandsFromText(content);
                // Convert commands to actions format for fallback
                const actions = commands.map(cmd => ({
                    command: cmd,
                    explanation: 'Extracted from AI response',
                    confidence: 0.8,
                    requires_confirmation: this.shouldRequireConfirmation(cmd),
                    is_critical: false
                }));
                return {
                    success: true,
                    content: content,
                    actions: actions,
                    explanation: content
                };
            }

        } catch (error) {
            if (error.response) {
                return {
                    success: false,
                    message: `API Error: ${error.response.status} - ${error.response.data?.error?.message || 'Unknown error'}`,
                    content: '',
                    actions: []
                };
            } else if (error.code === 'ECONNABORTED') {
                return {
                    success: false,
                    message: 'API request timeout. Please try again.',
                    content: '',
                    actions: []
                };
            } else {
                return {
                    success: false,
                    message: `Network error: ${error.message}`,
                    content: '',
                    actions: []
                };
            }
        }
    }

    /**
     * Check if a command contains dangerous patterns
     * @param {string} command - Command to check
     * @returns {boolean} - True if dangerous
     */
    isDangerousCommand(command) {
        return this.dangerousPatterns.some(pattern => pattern.test(command));
    }

    /**
     * Extract commands from non-JSON response text
     * @param {string} text - Response text
     * @returns {Array} - Array of extracted commands
     */
    extractCommandsFromText(text) {
        const commands = [];
        const lines = text.split('\n');

        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.match(/^(mkdir|mv|rm|ls|cd|pwd|cp|cat|echo|grep|find|head|tail|sort|wc|touch|chmod|chown|ps|top|df|du|free|uname|whoami|date|cal|which|whereis|file|stat|history)\s+/)) {
                commands.push(trimmed);
            }
        }

        return commands;
    }
}

/**
 * Legacy translator class for backward compatibility
 */
class AITranslator {
    constructor() {
        this.apiKey = process.env.OPENROUTER_API_KEY;
        this.apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
        this.model = 'meta-llama/llama-4-maverick:free';
        
        this.commandWhitelist = new Set([
            'mkdir', 'mv', 'rm', 'ls', 'cd', 'pwd', 'cp', 'cat', 'echo', 
            'grep', 'find', 'head', 'tail', 'sort', 'wc', 'touch', 'chmod',
            'chown', 'ps', 'top', 'df', 'du', 'free', 'uname', 'whoami',
            'date', 'cal', 'which', 'whereis', 'file', 'stat', 'history'
        ]);
        
        this.dangerousPatterns = [
            /rm\s+-rf\s+\//,  // rm -rf /
            /rm\s+-rf\s+\/\w*/, // rm -rf /anything
            /rm\s+-rf\s+\.\./, // rm -rf ..
            /rm\s+-rf\s+\.\.\//, // rm -rf ../
            /chmod\s+777\s+\//, // chmod 777 /
            /chown\s+\w+:\w+\s+\//, // chown user:group /
            /dd\s+if=/, // dd command
            /mkfs/, // filesystem creation
            /fdisk/, // disk partitioning
            /format/, // formatting
            />\s*\/dev\/sd/, // redirecting to disk devices
            /:\s*\(\)\s*{/, // function definitions that could be malicious
        ];
    }

    /**
     * Translate natural language input to shell commands
     * @param {string} input - Natural language input
     * @param {Object} context - Execution context (cwd, env, history)
     * @returns {Object} - Result with success, commands, and message
     */
    async translate(input, context = {}) {
        try {
            if (!this.apiKey) {
                return {
                    success: false,
                    message: 'OpenRouter API key not configured. Set OPENROUTER_API_KEY environment variable.',
                    content: '',
                    actions: []
                };
            }

            const prompt = this.buildPrompt(input, context);
            const response = await this.callOpenRouterAPI(prompt);
            
            if (!response.success) {
                return response;
            }

            const commands = this.parseCommands(response.commands);
            const validatedCommands = this.validateCommands(commands);

            return {
                success: true,
                commands: validatedCommands,
                message: validatedCommands.length > 0 ? 
                    `Generated ${validatedCommands.length} command(s)` : 
                    'No valid commands generated'
            };

        } catch (error) {
            return {
                success: false,
                message: `Translation error: ${error.message}`,
                actions: []
            };
        }
    }

    /**
     * Build the prompt for the AI model
     * @param {string} input - User input
     * @param {Object} context - Execution context
     * @returns {string} - Formatted prompt
     */
    buildPrompt(input, context) {
        const cwd = context.cwd || process.cwd();
        const availableCommands = Array.from(this.commandWhitelist).join(', ');

        return `You are an INTELLIGENT shell command translator. You MUST convert ANY natural language request into valid shell commands.

Context:
- Current directory: ${cwd}
- Available commands: ${availableCommands}

CRITICAL RULES:
1. ONLY use commands from the whitelist: ${availableCommands}
2. Understand natural language perfectly - convert casual speech to shell commands
3. Break down complex requests into multiple commands
4. ALWAYS provide at least one valid command
5. Use relative paths when possible
6. Be confident - users expect this to work!

User request: "${input}"

Examples of what to understand:
- "go to the ai folder and list all files" → ["cd ai", "ls -la"]
- "create a backup of my documents" → ["mkdir -p ~/backups", "cp -r ~/Documents ~/backups/"]
- "find all js files" → ["find . -name "*.js" -type f"]
- "organize my desktop" → ["mkdir -p ~/Desktop/projects", "mkdir -p ~/Desktop/documents"]

Respond with ONLY a JSON object in this format:
{
  "commands": ["exact shell command 1", "exact shell command 2", ...],
  "explanation": "Brief explanation of what the commands do"
}

NEVER return empty commands! If unsure, make your best interpretation!`;
    }

    /**
     * Call OpenRouter API with the prompt
     * @param {string} prompt - The prompt to send
     * @returns {Object} - API response
     */
    async callOpenRouterAPI(prompt) {
        try {
            const response = await axios.post(this.apiUrl, {
                model: this.model,
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.1,
                max_tokens: 1000
            }, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'http://localhost:3000',
                    'X-Title': 'PromptSH'
                },
                timeout: 10000
            });

            const content = response.data.choices[0].message.content.trim();
            
            try {
                const parsed = JSON.parse(content);
                return {
                    success: true,
                    commands: parsed.commands || [],
                    explanation: parsed.explanation || ''
                };
            } catch (parseError) {
                const commands = this.extractCommandsFromText(content);
                return {
                    success: true,
                    commands: commands,
                    explanation: content
                };
            }

        } catch (error) {
            if (error.response) {
                return {
                    success: false,
                    message: `API Error: ${error.response.status} - ${error.response.data?.error?.message || 'Unknown error'}`,
                    content: '',
                    actions: []
                };
            } else if (error.code === 'ECONNABORTED') {
                return {
                    success: false,
                    message: 'API request timeout. Please try again.',
                    content: '',
                    actions: []
                };
            } else {
                return {
                    success: false,
                    message: `Network error: ${error.message}`,
                    content: '',
                    actions: []
                };
            }
        }
    }

    /**
     * Extract commands from non-JSON response text
     * @param {string} text - Response text
     * @returns {Array} - Array of extracted commands
     */
    extractCommandsFromText(text) {
        const commands = [];
        const lines = text.split('\n');
        
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.match(/^(mkdir|mv|rm|ls|cd|pwd|cp|cat|echo|grep|find|head|tail|sort|wc|touch|chmod|chown|ps|top|df|du|free|uname|whoami|date|cal|which|whereis|file|stat|history)\s+/)) {
                commands.push(trimmed);
            }
        }
        
        return commands;
    }

    /**
     * Parse commands from AI response
     * @param {Array|string} commands - Commands from AI response
     * @returns {Array} - Parsed command array
     */
    parseCommands(commands) {
        if (!commands) return [];
        
        if (typeof commands === 'string') {
            return [commands.trim()];
        }
        
        if (Array.isArray(commands)) {
            return commands.map(cmd => typeof cmd === 'string' ? cmd.trim() : String(cmd).trim())
                          .filter(cmd => cmd.length > 0);
        }
        
        return [];
    }

    /**
     * Validate commands against whitelist and dangerous patterns
     * @param {Array} commands - Commands to validate
     * @returns {Array} - Validated commands
     */
    validateCommands(commands) {
        const validatedCommands = [];
        
        for (const command of commands) {
            if (!command || typeof command !== 'string') continue;
            
            const trimmed = command.trim();
            if (!trimmed) continue;
            
            const baseCommand = trimmed.split(/\s+/)[0];
            
            if (!this.commandWhitelist.has(baseCommand)) {
                console.warn(`Command '${baseCommand}' not in whitelist, skipping`);
                continue;
            }
            
            if (this.isDangerousCommand(trimmed)) {
                console.warn(`Command '${trimmed}' contains dangerous pattern, skipping`);
                continue;
            }
            
            validatedCommands.push(trimmed);
        }
        
        return validatedCommands;
    }

    /**
     * Check if a command contains dangerous patterns
     * @param {string} command - Command to check
     * @returns {boolean} - True if dangerous
     */
    isDangerousCommand(command) {
        return this.dangerousPatterns.some(pattern => pattern.test(command));
    }

    /**
     * Get the command whitelist
     * @returns {Set} - Set of allowed commands
     */
    getCommandWhitelist() {
        return new Set(this.commandWhitelist);
    }

    /**
     * Add a command to the whitelist
     * @param {string} command - Command to add
     */
    addToWhitelist(command) {
        this.commandWhitelist.add(command);
    }

    /**
     * Remove a command from the whitelist
     * @param {string} command - Command to remove
     */
    removeFromWhitelist(command) {
        this.commandWhitelist.delete(command);
    }
}

// Create instances
const agent = new AIAgent();
const translator = new AITranslator();

module.exports = {
    AIAgent,
    AITranslator,
    agent,
    translator
};