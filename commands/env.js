/**
 * Environment Variables Command
 * 
 * @param {Array} args - Command arguments [variableName] or [set, name, value]
 * @param {Object} context - Execution context containing cwd, env, etc.
 * @returns {string} - Environment variable information or set result
 */
function env(args, context) {
    try {
        if (args.length === 0) {
            const envVars = Object.keys(context.env)
                .sort()
                .map(key => `${key}=${context.env[key]}`)
                .join('\n');
            return envVars;
        }
        
        if (args[0] === 'set' && args.length >= 3) {
            const varName = args[1];
            const varValue = args.slice(2).join(' ');
            context.env[varName] = varValue;
            return `Set ${varName}=${varValue}`;
        }
        
        if (args[0] === 'unset' && args.length >= 2) {
            const varName = args[1];
            if (context.env.hasOwnProperty(varName)) {
                delete context.env[varName];
                return `Unset ${varName}`;
            } else {
                return `Variable ${varName} not found`;
            }
        }
        
        const varName = args[0];
        if (context.env.hasOwnProperty(varName)) {
            return context.env[varName];
        } else {
            return `Variable ${varName} not found`;
        }
        
    } catch (error) {
        return `env: ${error.message}`;
    }
}

module.exports = env;
