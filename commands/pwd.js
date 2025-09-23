/**
 * Print Working Directory Command
 * 
 * @param {Array} args - Command arguments (unused)
 * @param {Object} context - Execution context containing cwd, env, etc.
 * @returns {string} - Current working directory path
 */
function pwd(args, context) {
    return context.cwd;
}

module.exports = pwd;