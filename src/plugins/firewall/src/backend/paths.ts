/** Where Termix keeps its own rules on nftables and iptables hosts. */
export const STATE_DIR = "/etc/termix-firewall";
/** Backups waiting to undo a change, one folder per change. */
export const PENDING_DIR = "/var/lib/termix-firewall/pending";
