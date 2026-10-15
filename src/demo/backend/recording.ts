/**
 * Set by the Videos repo while it records, so the demo looks like a real
 * server: no demo hints and no surprise alerts.
 */
export function isRecording(): boolean {
  try {
    return localStorage.getItem("termix-demo-recording") === "1";
  } catch {
    return false;
  }
}
