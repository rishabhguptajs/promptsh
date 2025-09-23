const readline = require('readline');
const { executor } = require('./executor');
const { AutocompleteUI } = require('./utils/autocomplete-ui');
const path = require('path');

/**
 * CLI Loop - User-facing interface for the shell
 * 
 * Responsibilities:
 * - Input capture using readline
 * - Command execution via executor
 * - Output display and formatting
 * - State management and updates
 * - Loop control and exit handling
 */
class CLILoop {
    constructor() {
        this.rl = null;
        this.isRunning = false;
        this.autocompleteUI = new AutocompleteUI();
        this.sessionContext = {
            cwd: process.cwd(),
            startTime: new Date().toISOString(),
            commandCount: 0
        };
    }

    /**
     * Initialize the readline interface
     */
    initializeReadline() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: this.getPrompt()
        });

        this.autocompleteUI.initialize(this.rl, this.getAutocompleteContext());

        this.rl.on('line', async (input) => {
            await this.handleInput(input.trim());
        });

        this.rl.on('SIGINT', () => {
            this.handleExit();
        });

        this.rl.on('close', () => {
            this.handleExit();
        });
    }

    /**
     * Get the current prompt string
     * @returns {string} - Formatted prompt
     */
    getPrompt() {
        const cwd = this.sessionContext.cwd;
        const shortCwd = path.basename(cwd) === '' ? '/' : path.basename(cwd);
        return `promptsh:${shortCwd}$ `;
    }

    /**
     * Update the prompt with current working directory
     */
    updatePrompt() {
        if (this.rl) {
            this.rl.setPrompt(this.getPrompt());
        }
    }

    /**
     * Handle user input
     * @param {string} input - User input string
     */
    async handleInput(input) {
        if (!input) {
            this.rl.prompt();
            return;
        }

        if (this.isExitCommand(input)) {
            this.handleExit();
            return;
        }

        try {
            this.sessionContext.commandCount++;

            const result = await executor.execute(input, this.sessionContext);

            this.displayOutput(result);

            this.updateSessionContext(input, result);

            this.updatePrompt();

        } catch (error) {
            console.error(`Error: ${error.message}`);
        }

        this.rl.prompt();
    }

    /**
     * Check if input is an exit command
     * @param {string} input - User input
     * @returns {boolean} - True if exit command
     */
    isExitCommand(input) {
        const exitCommands = ['exit', 'quit', 'bye', 'logout'];
        return exitCommands.includes(input.toLowerCase());
    }

    /**
     * Display command output
     * @param {Object} result - Execution result from executor
     */
    displayOutput(result) {
        if (result.success) {
            if (result.output) {
                console.log(result.output);
            }
        } else {
            const errorColor = '\x1b[31m'; 
            const resetColor = '\x1b[0m';
            console.error(`${errorColor}Error: ${result.output}${resetColor}`);
        }

        if (result.data && result.data.totalCommands > 1) {
            const { totalCommands, successfulCommands } = result.data;
            console.log(`\nExecuted ${successfulCommands}/${totalCommands} commands successfully`);
        }
    }

    /**
     * Update session context based on command execution
     * @param {string} input - Original input
     * @param {Object} result - Execution result
     */
    updateSessionContext(input, result) {
        if (input.startsWith('cd ') || input === 'cd') {
            const newCwd = result.data?.newCwd || result.output?.trim();
            if (newCwd && newCwd !== this.sessionContext.cwd) {
                this.sessionContext.cwd = newCwd;
            }
        }

        executor.updateContext(this.sessionContext);
        
        this.autocompleteUI.updateContext(this.getAutocompleteContext());
    }

    /**
     * Handle exit/cleanup
     */
    handleExit() {
        console.log('\nGoodbye! 👋');
        
        const duration = new Date() - new Date(this.sessionContext.startTime);
        const minutes = Math.floor(duration / 60000);
        const seconds = Math.floor((duration % 60000) / 1000);
        
        console.log(`Session summary:`);
        console.log(`- Commands executed: ${this.sessionContext.commandCount}`);
        console.log(`- Session duration: ${minutes}m ${seconds}s`);
        
        if (this.rl) {
            this.rl.close();
        }
        
        process.exit(0);
    }

    /**
     * Get context for autocomplete
     * @returns {Object} Context object for autocomplete
     */
    getAutocompleteContext() {
        return {
            cwd: this.sessionContext.cwd,
            history: executor.getHistory(10),
            variables: executor.getAllVariables(),
            commandCount: this.sessionContext.commandCount
        };
    }

    /**
     * Start the CLI loop
     */
    start() {
        if (this.isRunning) {
            console.log('CLI is already running');
            return;
        }

        this.isRunning = true;
        
        console.log('🚀 Welcome to PromptSH - Your AI-Powered Shell');
        console.log('Type commands or ask in natural language. Use "exit" to quit.');
        console.log('💡 Autocomplete: Tab for suggestions, Right arrow to accept, Ctrl+Space for next word\n');

        this.initializeReadline();
        
        executor.updateContext(this.sessionContext);
        
        this.rl.prompt();
    }

    /**
     * Stop the CLI loop
     */
    stop() {
        if (this.rl) {
            this.rl.close();
        }
        this.isRunning = false;
    }
}

const cli = new CLILoop();

process.on('uncaughtException', (error) => {
    console.error('\nUncaught Exception:', error.message);
    cli.stop();
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('\nUnhandled Rejection at:', promise, 'reason:', reason);
    cli.stop();
    process.exit(1);
});

cli.start();