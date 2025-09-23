const axios = require('axios');
const dotenv = require('dotenv');
dotenv.config();

/**
 * AI Translator Module - Converts natural language to shell commands
 * 
 * Responsibilities:
 * - Accept natural language input and context
 * - Generate validated shell commands using OpenRouter API
 * - Validate commands against whitelist for safety
 * - Return formatted command output
 */
class AITranslator {
    constructor() {
        this.apiKey = process.env.OPENROUTER_API_KEY;
        this.apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
        this.model = 'meta-llama/llama-3.2-3b-instruct:free';
        
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
                    commands: []
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
                commands: []
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
        
        return `You are a shell command translator. Convert the user's natural language request into valid shell commands.

Context:
- Current directory: ${cwd}
- Available commands: ${availableCommands}

Rules:
1. Only use commands from the whitelist: ${availableCommands}
2. Use relative paths when possible
3. For multi-step operations, return commands as an array
4. Do not use dangerous patterns like "rm -rf /" or system file operations
5. Be specific with file paths and avoid wildcards that could be destructive
6. If the request is unclear or potentially dangerous, explain why

User request: "${input}"

Respond with ONLY a JSON object in this format:
{
  "commands": ["command1", "command2", ...],
  "explanation": "Brief explanation of what the commands do"
}

If no valid commands can be generated, return:
{
  "commands": [],
  "explanation": "Explanation of why no commands were generated"
}`;
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
                    commands: []
                };
            } else if (error.code === 'ECONNABORTED') {
                return {
                    success: false,
                    message: 'API request timeout. Please try again.',
                    commands: []
                };
            } else {
                return {
                    success: false,
                    message: `Network error: ${error.message}`,
                    commands: []
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

const translator = new AITranslator();

module.exports = {
    AITranslator,
    translator
};
