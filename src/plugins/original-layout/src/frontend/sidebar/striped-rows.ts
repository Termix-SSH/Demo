// stripedRows is in the sidebar preferences from Termix 26.10.6; older cores
// drop it, and then rows stay striped as before.
export function stripedRows(display: object): boolean {
  return (display as { stripedRows?: boolean }).stripedRows !== false;
}
