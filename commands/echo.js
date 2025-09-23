const fs = require('fs');
const path = require('path');

/**
 * Echo Command - Display text or write to files
 * 
 * Usage:
 * - echo <text> - Display text to stdout
 * - echo <text> > <file> - Write text to file (overwrite)
 * - echo <text> >> <file> - Append text to file
 * - echo -n <text> - Display text without newline
 * - echo -e <text> - Enable interpretation of backslash escapes
 */
async function echo(args, context) {
    if (args.length === 0) {
        return {
            success: false,
            output: `Usage: echo [options] <text> [>|>> <file>]
Options:
  -n    Do not output the trailing newline
  -e    Enable interpretation of backslash escapes
  -E    Disable interpretation of backslash escapes (default)

Examples:
  echo "Hello World"                    - Display text
  echo "Hello" > file.txt               - Write to file (overwrite)
  echo "World" >> file.txt              - Append to file
  echo -n "No newline"                  - Display without newline
  echo -e "Line1\\nLine2"               - Interpret escape sequences`,
            error: 'INVALID_ARGS'
        };
    }

    let options = {
        noNewline: false,
        enableEscapes: false
    };

    let textParts = [];
    let outputFile = null;
    let appendMode = false;
    let i = 0;

    while (i < args.length && args[i].startsWith('-')) {
        const option = args[i];
        if (option === '-n') {
            options.noNewline = true;
        } else if (option === '-e') {
            options.enableEscapes = true;
        } else if (option === '-E') {
            options.enableEscapes = false;
        } else if (option === '--help') {
            return {
                success: true,
                output: `Echo Command Help:

Displays text or writes to files.

Usage:
  echo [options] <text> [>|>> <file>]

Options:
  -n    Do not output the trailing newline
  -e    Enable interpretation of backslash escapes
  -E    Disable interpretation of backslash escapes (default)
  --help Show this help message

Examples:
  echo "Hello World"                    - Display text
  echo "Hello" > file.txt               - Write to file (overwrite)
  echo "World" >> file.txt              - Append to file
  echo -n "No newline"                  - Display without newline
  echo -e "Line1\\nLine2"               - Interpret escape sequences

Escape Sequences (with -e):
  \\n    New line
  \\t    Horizontal tab
  \\r    Carriage return
  \\\\    Backslash
  \\"    Double quote`,
                data: { help: true }
            };
        }
        i++;
    }

    while (i < args.length) {
        if (args[i] === '>' && i + 1 < args.length) {
            outputFile = args[i + 1];
            appendMode = false;
            i += 2;
            break;
        } else if (args[i] === '>>' && i + 1 < args.length) {
            outputFile = args[i + 1];
            appendMode = true;
            i += 2;
            break;
        } else {
            textParts.push(args[i]);
            i++;
        }
    }

    if (textParts.length === 0) {
        return {
            success: false,
            output: 'No text provided',
            error: 'NO_TEXT'
        };
    }

    let text = textParts.join(' ');

    if (options.enableEscapes) {
        text = text
            .replace(/\\n/g, '\n')
            .replace(/\\t/g, '\t')
            .replace(/\\r/g, '\r')
            .replace(/\\\\/g, '\\')
            .replace(/\\"/g, '"');
    }

    if (!options.noNewline) {
        text += '\n';
    }

    if (outputFile) {
        try {
            const fullPath = path.resolve(context.cwd, outputFile);
            const dir = path.dirname(fullPath);

            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            if (appendMode) {
                fs.appendFileSync(fullPath, text);
            } else {
                fs.writeFileSync(fullPath, text);
            }

            return {
                success: true,
                output: `Text ${appendMode ? 'appended to' : 'written to'} ${outputFile}`,
                data: {
                    file: outputFile,
                    appendMode,
                    textLength: text.length
                }
            };
        } catch (error) {
            return {
                success: false,
                output: `Error writing to file: ${error.message}`,
                error: error.message
            };
        }
    }

    return {
        success: true,
        output: text,
        data: {
            textLength: text.length,
            noNewline: options.noNewline,
            enableEscapes: options.enableEscapes
        }
    };
}

module.exports = echo;
