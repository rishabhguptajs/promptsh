const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

/**
 * Context Object - Manages session-specific state
 * 
 * Purpose: Keep session-specific state without relying on global variables
 * Key properties: cwd, history, sessionId, variables, tempPaths
 * 
 * Why it matters:
 * - Allows multiple sessions or future web integration
 * - Essential for AI layer to understand "current state" of the shell
 */
class Context {
    constructor(initialCwd = process.cwd()) {
        this.sessionId = uuidv4();
        this.cwd = initialCwd;
        this.env = { ...process.env };
        this.history = [];
        this.variables = new Map();
        this.tempPaths = new Set();
        this.startTime = new Date();
        this.lastCommand = null;
        this.commandCount = 0;
    }

    /**
     * Get current working directory
     * @returns {string} Current working directory path
     */
    getCwd() {
        return this.cwd;
    }

    /**
     * Set current working directory
     * @param {string} newCwd - New working directory path
     * @returns {boolean} True if successful, false otherwise
     */
    setCwd(newCwd) {
        try {
            if (fs.existsSync(newCwd) && fs.statSync(newCwd).isDirectory()) {
                this.cwd = path.resolve(newCwd);
                return true;
            }
            return false;
        } catch (error) {
            return false;
        }
    }

    /**
     * Add command to history
     * @param {string} command - Command string
     * @param {Array} args - Command arguments
     * @param {string} result - Command result
     */
    addToHistory(command, args = [], result = '') {
        const historyEntry = {
            id: this.commandCount++,
            command,
            args,
            result,
            timestamp: new Date().toISOString(),
            cwd: this.cwd,
            sessionId: this.sessionId
        };
        
        this.history.push(historyEntry);
        this.lastCommand = historyEntry;
        
        if (this.history.length > 1000) {
            this.history = this.history.slice(-1000);
        }
    }

    /**
     * Get command history
     * @param {number} limit - Maximum number of entries to return
     * @returns {Array} Array of history entries
     */
    getHistory(limit = null) {
        if (limit && limit > 0) {
            return this.history.slice(-limit);
        }
        return [...this.history];
    }

    /**
     * Clear command history
     */
    clearHistory() {
        this.history = [];
        this.commandCount = 0;
    }

    /**
     * Set a session variable
     * @param {string} key - Variable name
     * @param {any} value - Variable value
     */
    setVariable(key, value) {
        this.variables.set(key, value);
    }

    /**
     * Get a session variable
     * @param {string} key - Variable name
     * @param {any} defaultValue - Default value if key doesn't exist
     * @returns {any} Variable value or default
     */
    getVariable(key, defaultValue = null) {
        return this.variables.has(key) ? this.variables.get(key) : defaultValue;
    }

    /**
     * Get all session variables
     * @returns {Object} Object containing all variables
     */
    getAllVariables() {
        const variables = {};
        for (const [key, value] of this.variables) {
            variables[key] = value;
        }
        return variables;
    }

    /**
     * Remove a session variable
     * @param {string} key - Variable name
     * @returns {boolean} True if variable existed and was removed
     */
    removeVariable(key) {
        return this.variables.delete(key);
    }

    /**
     * Clear all session variables
     */
    clearVariables() {
        this.variables.clear();
    }

    /**
     * Add a temporary path to track
     * @param {string} tempPath - Temporary file or directory path
     */
    addTempPath(tempPath) {
        this.tempPaths.add(path.resolve(tempPath));
    }

    /**
     * Remove a temporary path from tracking
     * @param {string} tempPath - Temporary file or directory path
     * @returns {boolean} True if path was being tracked
     */
    removeTempPath(tempPath) {
        return this.tempPaths.delete(path.resolve(tempPath));
    }

    /**
     * Get all tracked temporary paths
     * @returns {Array} Array of temporary paths
     */
    getTempPaths() {
        return Array.from(this.tempPaths);
    }

    /**
     * Clean up all temporary paths
     * @returns {Array} Array of cleaned up paths
     */
    cleanupTempPaths() {
        const cleanedPaths = [];
        
        for (const tempPath of this.tempPaths) {
            try {
                if (fs.existsSync(tempPath)) {
                    fs.removeSync(tempPath);
                    cleanedPaths.push(tempPath);
                }
            } catch (error) {
                console.warn(`Failed to clean up temp path ${tempPath}: ${error.message}`);
            }
        }
        
        this.tempPaths.clear();
        return cleanedPaths;
    }

    /**
     * Get session information
     * @returns {Object} Session information object
     */
    getSessionInfo() {
        return {
            sessionId: this.sessionId,
            startTime: this.startTime,
            uptime: Date.now() - this.startTime.getTime(),
            commandCount: this.commandCount,
            currentCwd: this.cwd,
            tempPathCount: this.tempPaths.size,
            variableCount: this.variables.size,
            historyLength: this.history.length
        };
    }

    /**
     * Create a context snapshot for serialization
     * @returns {Object} Serializable context snapshot
     */
    toSnapshot() {
        return {
            sessionId: this.sessionId,
            cwd: this.cwd,
            env: this.env,
            history: this.history,
            variables: this.getAllVariables(),
            tempPaths: this.getTempPaths(),
            startTime: this.startTime,
            commandCount: this.commandCount
        };
    }

    /**
     * Restore context from snapshot
     * @param {Object} snapshot - Context snapshot object
     */
    fromSnapshot(snapshot) {
        this.sessionId = snapshot.sessionId || uuidv4();
        this.cwd = snapshot.cwd || process.cwd();
        this.env = snapshot.env || { ...process.env };
        this.history = snapshot.history || [];
        this.tempPaths = new Set(snapshot.tempPaths || []);
        this.startTime = snapshot.startTime ? new Date(snapshot.startTime) : new Date();
        this.commandCount = snapshot.commandCount || 0;
        
        this.variables.clear();
        if (snapshot.variables) {
            for (const [key, value] of Object.entries(snapshot.variables)) {
                this.variables.set(key, value);
            }
        }
    }

    /**
     * Reset context to initial state
     */
    reset() {
        this.cwd = process.cwd();
        this.history = [];
        this.variables.clear();
        this.tempPaths.clear();
        this.commandCount = 0;
        this.lastCommand = null;
    }
}

module.exports = Context;
