import { useEffect, useRef } from "react";
import { useXTerm } from "react-xtermjs";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { splitDragState, registerFitCallback } from "@/ui/splitDragging";

export function TerminalTab({ label }: { label: string }) {
  const { instance, ref } = useXTerm();
  const commandBuffer = useRef("");

  useEffect(() => {
    if (!instance || !ref.current) return;

    instance.options.theme = {
      background: "#111210",
      foreground: "#ffffff",
      cursor: "#fb923c",
    };

    const fitAddon = new FitAddon();
    instance.loadAddon(fitAddon);

    const prompt = `\r\n\x1b[38;2;251;146;60muser@${label.toLowerCase().replace(/\s+/g, "-")}\x1b[0m:\x1b[38;2;96;165;250m~\x1b[0m$ `;

    instance.writeln(`\x1b[1m\x1b[38;2;251;146;60mTermix\x1b[0m v1.0.0 (SSH: ${label})`);
    instance.writeln('Type "help" for a list of commands.');
    instance.write(prompt);

    const disposable = instance.onData((data) => {
      const char = data;
      if (char === "\r") {
        const command = commandBuffer.current.trim();
        instance.write("\r\n");

        if (command === "help") {
          instance.writeln("Available commands: help, ls, clear, whoami, exit");
        } else if (command === "ls") {
          instance.writeln("apps  configs  documents  logs  scripts");
        } else if (command === "clear") {
          instance.clear();
        } else if (command === "whoami") {
          instance.writeln("user");
        } else if (command === "exit") {
          instance.writeln("Connection closed.");
        } else if (command !== "") {
          instance.writeln(`-bash: ${command}: command not found`);
        }

        commandBuffer.current = "";
        instance.write(prompt);
      } else if (char === "") {
        if (commandBuffer.current.length > 0) {
          commandBuffer.current = commandBuffer.current.slice(0, -1);
          instance.write("\b \b");
        }
      } else if (char.charCodeAt(0) >= 32 && char.charCodeAt(0) <= 126) {
        commandBuffer.current += char;
        instance.write(char);
      }
    });

    function doFit() {
      try { fitAddon.fit(); } catch (e) {}
    }

    let fitTimer: ReturnType<typeof setTimeout> | null = null;
    function scheduleFit() {
      // Skip entirely while a split divider is being dragged
      if (splitDragState.active) return;
      if (fitTimer) clearTimeout(fitTimer);
      fitTimer = setTimeout(doFit, 50);
    }

    const resizeObserver = new ResizeObserver(scheduleFit);
    resizeObserver.observe(ref.current);

    // Fit once on mount
    setTimeout(doFit, 100);

    // Fit once after any split drag ends
    const unregister = registerFitCallback(doFit);

    return () => {
      disposable.dispose();
      resizeObserver.disconnect();
      if (fitTimer) clearTimeout(fitTimer);
      unregister();
    };
  }, [instance]);

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden bg-[#111210] p-1">
      <div ref={ref} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}
