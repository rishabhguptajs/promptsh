const axios = require('axios');

/**
 * Autocomplete Service - AI-powered command and text completion
 * 
 * Responsibilities:
 * - Interface with local Ollama instance
 * - Generate context-aware suggestions
 * - Provide command completion and next-word prediction
 * - Cache suggestions for performance
 */
class AutocompleteService {
    constructor() {
        this.ollamaUrl = 'http://localhost:11434';
        this.model = 'gemma3:1b';
        this.cache = new Map();
        this.cacheTimeout = 30000; 
        this.maxSuggestions = 5;
        this.contextWindow = 200; 
    }

    /**
     * Check if Ollama service is available
     * @returns {Promise<boolean>} True if Ollama is running
     */
    async isOllamaAvailable() {
        try {
            const response = await axios.get(`${this.ollamaUrl}/api/tags`, {
                timeout: 2000
            });
            return response.status === 200;
        } catch (error) {
            return false;
        }
    }

    /**
     * Get available models from Ollama
     * @returns {Promise<Array>} Array of available models
     */
    async getAvailableModels() {
        try {
            const response = await axios.get(`${this.ollamaUrl}/api/tags`);
            return response.data.models || [];
        } catch (error) {
            console.warn('Could not fetch Ollama models:', error.message);
            return [];
        }
    }

    /**
     * Generate completion suggestions using Ollama
     * @param {string} input - Current input text
     * @param {Object} context - Shell context (history, cwd, etc.)
     * @param {string} type - Type of completion ('command', 'argument', 'next_word')
     * @returns {Promise<Array>} Array of suggestions
     */
    async generateSuggestions(input, context = {}, type = 'next_word') {
        const cacheKey = `${input}_${type}_${JSON.stringify(context).slice(0, 50)}`;
        
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.cacheTimeout) {
                return cached.suggestions;
            }
        }

        try {
            const prompt = this.buildPrompt(input, context, type);
            const suggestions = await this.queryOllama(prompt);
            
            this.cache.set(cacheKey, {
                suggestions,
                timestamp: Date.now()
            });

            return suggestions;
        } catch (error) {
            console.warn('Autocomplete error:', error.message);
            return this.getFallbackSuggestions(input, context, type);
        }
    }

    /**
     * Build context-aware prompt for Ollama
     * @param {string} input - Current input
     * @param {Object} context - Shell context
     * @param {string} type - Completion type
     * @returns {string} Formatted prompt
     */
    buildPrompt(input, context, type) {
        const { history = [], cwd = '', variables = {} } = context;
        
        const recentHistory = history.slice(-5).map(h => h.command).join('\n');
        
        let contextStr = `Current directory: ${cwd}\n`;
        if (recentHistory) {
            contextStr += `Recent commands:\n${recentHistory}\n`;
        }
        
        const relevantVars = Object.keys(variables).slice(0, 3);
        if (relevantVars.length > 0) {
            contextStr += `Variables: ${relevantVars.join(', ')}\n`;
        }

        switch (type) {
            case 'command':
                return `${contextStr}Complete this shell command: "${input}"\nSuggest the most likely command completion. Return only the command name, no explanations.`;
            
            case 'argument':
                return `${contextStr}Complete this shell command with appropriate arguments: "${input}"\nSuggest the most likely argument. Return only the argument, no explanations.`;
            
            case 'next_word':
            default:
                return `${contextStr}Complete this text: "${input}"\nSuggest the next word or phrase. Return only the completion, no explanations.`;
        }
    }

    /**
     * Query Ollama API for completions
     * @param {string} prompt - Formatted prompt
     * @returns {Promise<Array>} Array of suggestions
     */
    async queryOllama(prompt) {
        try {
            const response = await axios.post(`${this.ollamaUrl}/api/generate`, {
                model: this.model,
                prompt: prompt,
                stream: false,
                options: {
                    temperature: 0.7,
                    top_p: 0.9,
                    max_tokens: 50,
                    stop: ['\n', '.', '!', '?']
                }
            }, {
                timeout: 5000
            });

            const completion = response.data.response?.trim();
            if (!completion) {
                return [];
            }

            const suggestions = this.parseCompletion(completion);
            return suggestions.slice(0, this.maxSuggestions);
        } catch (error) {
            throw new Error(`Ollama query failed: ${error.message}`);
        }
    }

    /**
     * Parse Ollama response into suggestions array
     * @param {string} completion - Raw completion from Ollama
     * @returns {Array} Array of cleaned suggestions
     */
    parseCompletion(completion) {
        const suggestions = completion
            .split(/[,\n\t]/)
            .map(s => s.trim())
            .filter(s => s.length > 0 && s.length < 100)
            .map(s => s.replace(/^["']|["']$/g, ''))
            .filter(s => !s.match(/^(the|a|an|and|or|but|in|on|at|to|for|of|with|by)$/i));

        return [...new Set(suggestions)]; 
    }

    /**
     * Get fallback suggestions when Ollama is unavailable
     * @param {string} input - Current input
     * @param {Object} context - Shell context
     * @param {string} type - Completion type
     * @returns {Array} Fallback suggestions
     */
    getFallbackSuggestions(input, context, type) {
        const { history = [] } = context;
        
        switch (type) {
            case 'command':
                const recentCommands = history
                    .slice(-10)
                    .map(h => h.command.split(' ')[0])
                    .filter(cmd => cmd.toLowerCase().includes(input.toLowerCase()))
                    .slice(0, 3);
                return recentCommands;

            case 'argument':
                if (input.includes('/')) {
                    return ['../', './'];
                }
                return ['*', '*.txt', '*.js'];

            case 'next_word':
            default:
                const commonWords = ['file', 'directory', 'path', 'command', 'output', 'result'];
                return commonWords.filter(word => 
                    word.toLowerCase().startsWith(input.toLowerCase())
                ).slice(0, 3);
        }
    }

    /**
     * Get command-specific suggestions
     * @param {string} command - Command name
     * @param {string} currentInput - Current input
     * @returns {Promise<Array>} Command-specific suggestions
     */
    async getCommandSuggestions(command, currentInput) {
        const commandPrompts = {
            'ls': 'List files and directories. Suggest common options like -la, -h, -t, or directory names.',
            'cd': 'Change directory. Suggest common directory names like .., ~, or recent directories.',
            'mkdir': 'Create directory. Suggest directory names.',
            'rm': 'Remove files. Suggest file patterns or common options like -rf.',
            'cp': 'Copy files. Suggest source and destination patterns.',
            'mv': 'Move files. Suggest source and destination patterns.',
            'grep': 'Search text. Suggest search patterns or file patterns.',
            'find': 'Find files. Suggest search patterns or directory paths.',
            'ps': 'List processes. Suggest common options like -aux, -ef.',
            'kill': 'Kill processes. Suggest process IDs or signal names.'
        };

        const prompt = commandPrompts[command] || 'Complete this shell command.';
        const fullPrompt = `${prompt}\nCurrent input: "${currentInput}"\nSuggest the most likely completion. Return only the completion, no explanations.`;

        try {
            const response = await axios.post(`${this.ollamaUrl}/api/generate`, {
                model: this.model,
                prompt: fullPrompt,
                stream: false,
                options: {
                    temperature: 0.5,
                    max_tokens: 30
                }
            }, {
                timeout: 3000
            });

            const completion = response.data.response?.trim();
            return completion ? [completion] : [];
        } catch (error) {
            return this.getFallbackSuggestions(currentInput, {}, 'argument');
        }
    }

    /**
     * Clear the suggestion cache
     */
    clearCache() {
        this.cache.clear();
    }

    /**
     * Get cache statistics
     * @returns {Object} Cache statistics
     */
    getCacheStats() {
        return {
            size: this.cache.size,
            maxAge: this.cacheTimeout,
            entries: Array.from(this.cache.keys())
        };
    }
}

module.exports = {
    AutocompleteService
};
