export interface XmlNode {
  name: string;
  text: string;
  children: XmlNode[];
}

const TOKEN = /<(\/?)([A-Za-z0-9_:.-]+)([^>]*?)(\/?)>|([^<]+)/g;

export function unescapeXml(value: string): string {
  return value
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_m, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** A small XML reader for S3 answers. No attributes, no mixed content. */
export function parseXml(source: string): XmlNode {
  const root: XmlNode = { name: "#root", text: "", children: [] };
  const stack: XmlNode[] = [root];
  const cleaned = source
    .replace(/<\?[\s\S]*?\?>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "");
  for (const match of cleaned.matchAll(TOKEN)) {
    const [, closing, name, , selfClosing, text] = match;
    const top = stack[stack.length - 1];
    if (text !== undefined) {
      // Keep spaces inside a value, only the gaps between tags are dropped
      if (text.trim()) top.text += unescapeXml(text);
    } else if (closing) {
      if (stack.length > 1) stack.pop();
    } else {
      const node: XmlNode = { name, text: "", children: [] };
      top.children.push(node);
      if (!selfClosing) stack.push(node);
    }
  }
  return root.children[0] ?? root;
}

export function child(node: XmlNode | undefined, name: string) {
  return node?.children.find((c) => c.name === name);
}

export function childText(node: XmlNode | undefined, name: string) {
  return child(node, name)?.text;
}

export function all(node: XmlNode | undefined, name: string): XmlNode[] {
  return node?.children.filter((c) => c.name === name) ?? [];
}
