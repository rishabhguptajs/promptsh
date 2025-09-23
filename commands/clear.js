/**
 * Clear Command - Clears the terminal screen
 * 
 * @param {Array} args - Command arguments (unused)
 * @param {Object} context - Execution context containing cwd, env, etc.
 * @returns {string} - Clear screen command
 */
function clear(args, context) {
    try {
        process.stdout.write('\x1B[2J\x1B[0f');
        return '';
    } catch (error) {
        return `clear: ${error.message}`;
    }
}

module.exports = clear;
