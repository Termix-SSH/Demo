// Browser key codes (KeyboardEvent.code) to USB HID usage ids.

const USAGE: Record<string, number> = {
  Enter: 0x28,
  Escape: 0x29,
  Backspace: 0x2a,
  Tab: 0x2b,
  Space: 0x2c,
  Minus: 0x2d,
  Equal: 0x2e,
  BracketLeft: 0x2f,
  BracketRight: 0x30,
  Backslash: 0x31,
  Semicolon: 0x33,
  Quote: 0x34,
  Backquote: 0x35,
  Comma: 0x36,
  Period: 0x37,
  Slash: 0x38,
  CapsLock: 0x39,
  PrintScreen: 0x46,
  ScrollLock: 0x47,
  Pause: 0x48,
  Insert: 0x49,
  Home: 0x4a,
  PageUp: 0x4b,
  Delete: 0x4c,
  End: 0x4d,
  PageDown: 0x4e,
  ArrowRight: 0x4f,
  ArrowLeft: 0x50,
  ArrowDown: 0x51,
  ArrowUp: 0x52,
  NumLock: 0x53,
  NumpadDivide: 0x54,
  NumpadMultiply: 0x55,
  NumpadSubtract: 0x56,
  NumpadAdd: 0x57,
  NumpadEnter: 0x58,
  Numpad0: 0x62,
  NumpadDecimal: 0x63,
  ContextMenu: 0x65,
  IntlBackslash: 0x64,
};

for (let i = 0; i < 26; i++) USAGE[`Key${String.fromCharCode(65 + i)}`] = 4 + i;
for (let i = 1; i <= 9; i++) USAGE[`Digit${i}`] = 0x1d + i;
USAGE.Digit0 = 0x27;
for (let i = 1; i <= 12; i++) USAGE[`F${i}`] = 0x39 + i;
for (let i = 1; i <= 9; i++) USAGE[`Numpad${i}`] = 0x58 + i;

const MODIFIER: Record<string, number> = {
  ControlLeft: 0x01,
  ShiftLeft: 0x02,
  AltLeft: 0x04,
  MetaLeft: 0x08,
  ControlRight: 0x10,
  ShiftRight: 0x20,
  AltRight: 0x40,
  MetaRight: 0x80,
};

/** Tracks held keys and builds 8 byte boot keyboard reports. */
export function createKeyboard() {
  let modifiers = 0;
  const keys: number[] = [];
  return {
    /** Returns the new report, or null for a key that has no usage id. */
    press(code: string, down: boolean): number[] | null {
      const modifier = MODIFIER[code];
      if (modifier) {
        modifiers = down ? modifiers | modifier : modifiers & ~modifier;
      } else {
        const usage = USAGE[code];
        if (!usage) return null;
        const at = keys.indexOf(usage);
        if (down && at === -1) keys.push(usage);
        if (!down && at !== -1) keys.splice(at, 1);
      }
      const report = [modifiers, 0, 0, 0, 0, 0, 0, 0];
      keys.slice(0, 6).forEach((usage, index) => (report[2 + index] = usage));
      return report;
    },
    release(): number[] {
      modifiers = 0;
      keys.length = 0;
      return [0, 0, 0, 0, 0, 0, 0, 0];
    },
  };
}

export function isKnownKey(code: string): boolean {
  return code in USAGE || code in MODIFIER;
}
