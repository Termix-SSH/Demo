const PASSWORD_PROMPT =
  /(?:\[sudo\][^\n\r]*:\s*$|sudo:[^\n\r]*password[^\n\r]*required|password for [^\n\r]*:\s*$|Password:\s*$|password:\s*$)/im;

// macOS and BSD sudo only print "Password:", so the command and sudo's retry
// message are what tell it apart from an SSH login prompt.
const SUDO_OUTPUT = /\[sudo\b|sudo:|Sorry, try again/i;
const SUDO_COMMAND = /(?:^|[\s;&|(])sudo(?:\s|$)/;

/** Whether recent terminal output ends in a password prompt. */
export function isPasswordPrompt(output: string): boolean {
  return PASSWORD_PROMPT.test(output);
}

export function isSudoCommand(line: string): boolean {
  return SUDO_COMMAND.test(line);
}

/** Whether a password prompt comes from sudo. */
export function isSudoPrompt(output: string, lastCommand: string): boolean {
  return SUDO_OUTPUT.test(output) || isSudoCommand(lastCommand);
}

// Also covers charset switches like ESC ( B, which colored prompts end with,
// and OSC titles. Left in, they hide the prompt from the end-of-line match.
const ANSI =
  /\x1b(?:\][^\x07\x1b]*(?:\x07|\x1b\\)|[()#%*+][ -~]|[@-Z\\-_]|\[[0-9:;<=>?!]*[@-~])/g;

export function stripAnsi(output: string): string {
  return output.replace(ANSI, "");
}
