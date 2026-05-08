export function VncTab({ label }: { label: string }) {
  return (
    <div className="flex flex-col flex-1 min-h-0 items-center justify-center bg-background text-muted-foreground gap-2">
      <span className="text-lg font-semibold">VNC</span>
      <span className="text-sm font-mono">{label}</span>
    </div>
  );
}
