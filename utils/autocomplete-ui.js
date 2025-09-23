const { AutocompleteService } = require('../ai/autocomplete');

/**
 * Autocomplete UI Handler - Manages user interaction with autocomplete suggestions
 * 
 * Responsibilities:
 * - Handle readline autocomplete events
 * - Display suggestions in a user-friendly format
 * - Manage keyboard shortcuts for accepting suggestions
 * - Provide visual feedback for suggestions
 */
class AutocompleteUI {
    constructor() {
        this.autocompleteService = new AutocompleteService();
        this.currentSuggestions = [];
        this.selectedIndex = 0;
        this.isActive = false;
        this.currentInput = '';
        this.context = {};
        this.debounceTimer = null;
        this.debounceDelay = 300; 
        this.currentInlineSuggestion = null;
        this.inlineSuggestionShown = false;
    }

    /**
     * Initialize autocomplete for readline interface
     * @param {Object} rl - Readline interface instance
     * @param {Object} context - Shell context
     */
    initialize(rl, context = {}) {
        this.context = context;
        this.rl = rl;
        
        this.setupKeyHandlers(rl);
        
        console.log('🤖 Autocomplete enabled (Tab for suggestions, Right arrow to accept, Ctrl+Space for next word)');
    }


    /**
     * Get suggestions for current input
     * @param {string} input - Current input
     * @returns {Promise<Array>} Array of suggestions
     */
    async getSuggestions(input) {
        if (!input.trim()) {
            return [];
        }

        const words = input.trim().split(/\s+/);
        const lastWord = words[words.length - 1];
        const command = words[0];

        let type = 'next_word';
        if (words.length === 1 && !input.endsWith(' ')) {
            type = 'command';
        } else if (words.length > 1 && !input.endsWith(' ')) {
            type = 'argument';
        }

        try {
            const suggestions = await this.autocompleteService.generateSuggestions(
                input, 
                this.context, 
                type
            );

            const filteredSuggestions = suggestions.filter(suggestion => {
                if (type === 'command') {
                    return suggestion.toLowerCase().startsWith(lastWord.toLowerCase());
                } else if (type === 'argument') {
                    return suggestion.toLowerCase().includes(lastWord.toLowerCase());
                }
                return true;
            });

            return filteredSuggestions.slice(0, 10); 
        } catch (error) {
            console.warn('Failed to get suggestions:', error.message);
            return [];
        }
    }

    /**
     * Set up keyboard event handlers
     * @param {Object} rl - Readline interface
     */
    setupKeyHandlers(rl) {
        const originalCompleter = rl.completer;
        
        rl.completer = async (line) => {
            const suggestions = await this.getSuggestions(line);
            const hits = suggestions.filter(s => s.toLowerCase().startsWith(line.toLowerCase()));
            return [hits.length ? hits : suggestions, line];
        };

        rl.on('line', () => {
            this.clearInlineSuggestion();
        });

        rl.input.on('keypress', async (str, key) => {
            if (!key) return;

            if (key.name === 'tab') {
                key.preventDefault?.();
                await this.handleTabCompletion(rl);
                return;
            } 
            
            if (key.ctrl && key.name === 'space') {
                key.preventDefault?.();
                await this.handleNextWordSuggestion(rl);
                return;
            } 
            
            if (key.name === 'escape') {
                key.preventDefault?.();
                this.clearSuggestions(rl);
                this.clearInlineSuggestion();
                return;
            }

            if (key.name === 'right' && this.currentInlineSuggestion) {
                key.preventDefault?.();
                this.acceptInlineSuggestion(rl);
                return;
            }

            if (this.isTypingKey(key)) {
                clearTimeout(this.debounceTimer);
                this.debounceTimer = setTimeout(async () => {
                    await this.showInlineSuggestion(rl);
                }, this.debounceDelay);
            } else {
                this.clearInlineSuggestion();
            }
        });
    }

    /**
     * Check if key is a typing key (not navigation)
     * @param {Object} key - Key event object
     * @returns {boolean} True if typing key
     */
    isTypingKey(key) {
        if (key.ctrl || key.meta) return false;
        if (['up', 'down', 'left', 'right', 'home', 'end', 'pageup', 'pagedown'].includes(key.name)) return false;
        if (['backspace', 'delete', 'enter', 'return', 'tab'].includes(key.name)) return false;
        return true;
    }

    /**
     * Handle Tab key completion
     * @param {Object} rl - Readline interface
     */
    async handleTabCompletion(rl) {
        const currentLine = rl.line;
        const suggestions = await this.getSuggestions(currentLine);
        
        if (suggestions.length === 0) {
            const { executor } = require('../executor');
            const availableCommands = executor.getAvailableCommands();
            const matchingCommands = availableCommands.filter(cmd => 
                cmd.toLowerCase().startsWith(currentLine.toLowerCase())
            );
            
            if (matchingCommands.length > 0) {
                this.showSuggestions(matchingCommands.slice(0, 10));
            }
            return;
        }

        if (suggestions.length === 1) {
            this.acceptSuggestion(rl, suggestions[0]);
        } else {
            this.showSuggestions(suggestions);
        }
    }

    /**
     * Handle Ctrl+Space for next word suggestion
     * @param {Object} rl - Readline interface
     */
    async handleNextWordSuggestion(rl) {
        const currentLine = rl.line;
        const suggestions = await this.autocompleteService.generateSuggestions(
            currentLine,
            this.context,
            'next_word'
        );

        if (suggestions.length > 0) {
            this.showNextWordSuggestions(suggestions);
        }
    }

    /**
     * Accept a suggestion and update the input
     * @param {Object} rl - Readline interface
     * @param {string} suggestion - Suggestion to accept
     */
    acceptSuggestion(rl, suggestion) {
        const currentLine = rl.line;
        const words = currentLine.trim().split(/\s+/);
        
        let newLine;
        if (words.length === 1 && !currentLine.endsWith(' ')) {
            newLine = suggestion + ' ';
        } else {
            const lastWord = words[words.length - 1];
            newLine = currentLine.replace(new RegExp(`${lastWord}$`), suggestion) + ' ';
        }
        
        rl.line = newLine;
        rl.cursor = newLine.length;
        
        process.stdout.write('\r\x1b[K');
        process.stdout.write(rl.getPrompt() + newLine);
    }

    /**
     * Show multiple suggestions
     * @param {Array} suggestions - Array of suggestions
     */
    showSuggestions(suggestions) {
        console.log('\n📋 Suggestions:');
        suggestions.forEach((suggestion, index) => {
            console.log(`  ${index + 1}. ${suggestion}`);
        });
        console.log('Press Tab to accept the first suggestion, or type to continue.\n');
    }

    /**
     * Show next word suggestions
     * @param {Array} suggestions - Array of next word suggestions
     */
    showNextWordSuggestions(suggestions) {
        console.log('\n🔮 Next word suggestions:');
        suggestions.forEach((suggestion, index) => {
            console.log(`  ${index + 1}. ${suggestion}`);
        });
        console.log('Press Tab to accept the first suggestion, or continue typing.\n');
    }

    /**
     * Clear current suggestions
     * @param {Object} rl - Readline interface
     */
    clearSuggestions(rl) {
        this.currentSuggestions = [];
        this.selectedIndex = 0;
        this.isActive = false;
    }

    /**
     * Show inline suggestion as you type
     * @param {Object} rl - Readline interface
     */
    async showInlineSuggestion(rl) {
        if (!rl.line || rl.line.length === 0) {
            this.clearInlineSuggestion();
            return;
        }

        try {
            const suggestions = await this.getSuggestions(rl.line);
            if (suggestions.length === 0) {
                this.clearInlineSuggestion();
                return;
            }

            const bestSuggestion = suggestions[0];
            const currentLine = rl.line;
            
            let suggestionToShow = '';
            const words = currentLine.trim().split(/\s+/);
            const lastWord = words[words.length - 1];
            
            if (bestSuggestion.toLowerCase().startsWith(lastWord.toLowerCase()) && bestSuggestion.length > lastWord.length) {
                suggestionToShow = bestSuggestion.slice(lastWord.length);
            } else if (currentLine.endsWith(' ')) {
                suggestionToShow = bestSuggestion;
            }

            if (suggestionToShow) {
                this.displayInlineSuggestion(rl, suggestionToShow);
            } else {
                this.clearInlineSuggestion();
            }
        } catch (error) {
            this.clearInlineSuggestion();
        }
    }

    /**
     * Display inline suggestion with gray text
     * @param {Object} rl - Readline interface
     * @param {string} suggestion - Suggestion text to show
     */
    displayInlineSuggestion(rl, suggestion) {
        if (this.currentInlineSuggestion === suggestion) {
            return; 
        }

        this.clearInlineSuggestion();
        this.currentInlineSuggestion = suggestion;

        const currentLine = rl.line;
        const cursorPos = rl.cursor;

        const grayColor = '\x1b[90m';  
        const resetColor = '\x1b[0m';  
        
        process.stdout.write(`${grayColor}${suggestion}${resetColor}`);
        
        if (suggestion.length > 0) {
            process.stdout.write(`\x1b[${suggestion.length}D`); 
        }
        
        this.inlineSuggestionShown = true;
    }

    /**
     * Clear inline suggestion display
     */
    clearInlineSuggestion() {
        if (this.inlineSuggestionShown && this.currentInlineSuggestion) {
            const spaces = ' '.repeat(this.currentInlineSuggestion.length);
            process.stdout.write(spaces);
            process.stdout.write(`\x1b[${this.currentInlineSuggestion.length}D`); 
        }
        
        this.currentInlineSuggestion = null;
        this.inlineSuggestionShown = false;
    }

    /**
     * Accept the current inline suggestion
     * @param {Object} rl - Readline interface
     */
    acceptInlineSuggestion(rl) {
        if (!this.currentInlineSuggestion) {
            return;
        }

        const suggestion = this.currentInlineSuggestion;
        this.clearInlineSuggestion();

        rl.line += suggestion;
        rl.cursor = rl.line.length;

        process.stdout.write('\r\x1b[K'); 
        process.stdout.write(rl.getPrompt() + rl.line);
    }

    /**
     * Update context for better suggestions
     * @param {Object} newContext - Updated context
     */
    updateContext(newContext) {
        this.context = { ...this.context, ...newContext };
    }

    /**
     * Get autocomplete status
     * @returns {Object} Status information
     */
    getStatus() {
        return {
            isActive: this.isActive,
            suggestionsCount: this.currentSuggestions.length,
            selectedIndex: this.selectedIndex,
            cacheStats: this.autocompleteService.getCacheStats()
        };
    }

    /**
     * Clear autocomplete cache
     */
    clearCache() {
        this.autocompleteService.clearCache();
    }

    /**
     * Test autocomplete functionality
     * @param {string} input - Test input
     * @returns {Promise<Object>} Test results
     */
    async testAutocomplete(input) {
        try {
            const suggestions = await this.autocompleteService.generateSuggestions(
                input,
                this.context,
                'next_word'
            );
            
            return {
                success: true,
                input,
                suggestions,
                count: suggestions.length
            };
        } catch (error) {
            return {
                success: false,
                input,
                error: error.message
            };
        }
    }
}

module.exports = {
    AutocompleteUI
};
