/** Shell command that adds a public key to ~/.ssh/authorized_keys. */
export function deployKeyCommand(publicKey: string): string {
  // Single quotes so a key comment can't run anything when pasted.
  const quoted = `'${publicKey.trim().replace(/'/g, `'\\''`)}'`;
  return `mkdir -p ~/.ssh && chmod 700 ~/.ssh && echo ${quoted} >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys`;
}
