/**
 * Session Variables Command
 * 
 * @param {Array} args - Command arguments [variableName] or [set, name, value] or [list]
 * @param {Object} context - Execution context containing cwd, env, etc.
 * @returns {string} - Session variable information or set result
 */
function varCommand(args, context) {
    try {
        if (args.length === 0 || args[0] === 'list') {
            const variables = context.variables || {};
            if (Object.keys(variables).length === 0) {
                return 'No session variables set';
            }
            
            return Object.keys(variables)
                .sort()
                .map(key => `${key}=${variables[key]}`)
                .join('\n');
        }
        
        if (args[0] === 'set' && args.length >= 3) {
            const varName = args[1];
            const varValue = args.slice(2).join(' ');
            context.variables[varName] = varValue;
            return `Set session variable ${varName}=${varValue}`;
        }
        
        if (args[0] === 'unset' && args.length >= 2) {
            const varName = args[1];
            if (context.variables && context.variables.hasOwnProperty(varName)) {
                delete context.variables[varName];
                return `Unset session variable ${varName}`;
            } else {
                return `Session variable ${varName} not found`;
            }
        }
        
        if (args[0] === 'clear') {
            context.variables = {};
            return 'Cleared all session variables';
        }
        
        const varName = args[0];
        if (context.variables && context.variables.hasOwnProperty(varName)) {
            return context.variables[varName];
        } else {
            return `Session variable ${varName} not found`;
        }
        
    } catch (error) {
        return `var: ${error.message}`;
    }
}

module.exports = varCommand;
